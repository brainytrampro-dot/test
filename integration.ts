import { Injectable } from '@angular/core';
import { AbstractControl, FormGroup } from '@angular/forms';
import { EMPTY, Observable, Subject, merge, of, combineLatest } from 'rxjs';
import {
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  startWith,
  switchMap,
  takeUntil,
  tap,
} from 'rxjs/operators';
import { NumberUtils } from '@core/util/number-utils';
import { DossierDataService, DossierDataStoreService } from '@core/services';
import { TopVipService } from '@loan-dossier/services';
import { CcgCommessionMatrix } from '@core/models/ccg-commession-matrix';
import { CodeLabel } from '@core/models';

// ─────────────────────────────────────────────────────────────────────────────
// Context passé par le composant pour paramétrer les calculs
// ─────────────────────────────────────────────────────────────────────────────
export interface LoanCalculationContext {
  /** true si le produit inclut des frais notariaux (PPI / ClipriMRE hors Fogarim/VeFa) */
  hasNotaryFees: boolean;
  /** true si Fogarim ou Fogaloge */
  isFogarimOrFogaloge: boolean;
  /** code du produit sélectionné */
  productCode: string;
  /** Fonction dynamique — le composant la fournit pour que le service lise l'état courant */
  isNotaryFeesActive: () => boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers internes
// ─────────────────────────────────────────────────────────────────────────────

/** Convertit une valeur quelconque en nombre (0 si null/undefined/NaN) */
function toNum(value: any): number {
  return NumberUtils.toForcedNumber(value);
}

/** setValue sur un AbstractControl en mode disabled-safe (patchValue ne déclenche pas les validators) */
function setNum(ctrl: AbstractControl | null | undefined, value: number): void {
  if (!ctrl) return;
  ctrl.setValue(value, { emitEvent: true });
}

/** Crée un Observable valueChanges avec startWith et debounce optionnel */
function ctrlChanges(
  ctrl: AbstractControl | null | undefined,
  debounceMs = 0
): Observable<any> {
  if (!ctrl) return EMPTY;
  const base$ = ctrl.valueChanges.pipe(startWith(ctrl.value));
  return debounceMs > 0 ? base$.pipe(debounceTime(debounceMs)) : base$;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class LoanDataCalculationService {
  constructor(
    private dossierDataService: DossierDataService,
    private dossierStore: DossierDataStoreService,
    private topVipService: TopVipService
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Point d'entrée principal — appelé une seule fois depuis ngOnInit
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Branche tous les calculs réactifs sur le FormGroup.
   * Toutes les subscriptions sont automatiquement détruites via destroy$.
   *
   * @param fg       Le FormGroup loanDataFormGroup du composant
   * @param ctx      Contexte produit (flags, fonctions dynamiques)
   * @param destroy$ Subject émis dans ngOnDestroy du composant
   */
  setupAll(
    fg: FormGroup,
    ctx: LoanCalculationContext,
    destroy$: Subject<void>
  ): void {
    this.setupInvestmentAmount(fg, ctx, destroy$);
    this.setupLoanAmount(fg, ctx, destroy$);
    this.setupApport(fg, destroy$);
    this.setupPercentOfApport(fg, destroy$);

    if (ctx.isFogarimOrFogaloge) {
      this.setupSocialHousing(fg, destroy$);
      this.setupMonthlyCoefficient(fg, ctx, destroy$);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Montant d'investissement
  //    = acquisitionPrice + buildDevelopmentQuotation [+ acquisitionFee si PPI/ClipriMRE]
  // ───────────────────────────────────────────────────────────────────────────
  setupInvestmentAmount(
    fg: FormGroup,
    ctx: LoanCalculationContext,
    destroy$: Subject<void>
  ): void {
    const price$ = ctrlChanges(fg.get('acquisitionPrice'));
    const quotation$ = ctrlChanges(fg.get('buildDevelopmentQuotation'));
    // acquisitionFee n'existe que si hasNotaryFees — on guard avec EMPTY sinon
    const fee$ = fg.get('acquisitionFee') ? ctrlChanges(fg.get('acquisitionFee')) : of(0);

    merge(price$, quotation$, fee$)
      .pipe(
        takeUntil(destroy$),
        map(() => {
          const price = toNum(fg.get('acquisitionPrice')?.value);
          const quotation = toNum(fg.get('buildDevelopmentQuotation')?.value);
          // On relit le flag dynamiquement pour couvrir le cas ClipriMRE runtime
          const fee = ctx.isNotaryFeesActive()
            ? toNum(fg.get('acquisitionFee')?.value)
            : 0;
          return price + quotation + fee;
        }),
        filter((total) => total > 0)
      )
      .subscribe((total) => {
        setNum(fg.get('investmentAmount'), total);
      });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Montant du prêt
  //    = claimedAmountOfBuildDevelopment + claimedAmountOfPurchase [+ requestedNotaryFee si PPI/ClipriMRE]
  //    → met aussi à jour applicationFee (loanAmount × 0.001)
  //    → notifie TopVipService
  // ───────────────────────────────────────────────────────────────────────────
  setupLoanAmount(
    fg: FormGroup,
    ctx: LoanCalculationContext,
    destroy$: Subject<void>
  ): void {
    const build$ = ctrlChanges(fg.get('claimedAmountOfBuildDevelopment'));
    const purchase$ = ctrlChanges(fg.get('claimedAmountOfPurchase'));
    const notary$ = fg.get('requestedNotaryFee')
      ? ctrlChanges(fg.get('requestedNotaryFee'))
      : of(0);

    merge(build$, purchase$, notary$)
      .pipe(
        takeUntil(destroy$),
        map(() => this.computeLoanSum(fg, ctx))
      )
      .subscribe((sum) => {
        setNum(fg.get('loanAmount'), sum);
        setNum(fg.get('applicationFee'), NumberUtils.round(sum * 0.001, 2));
        this.topVipService.next(sum);
      });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Apport personnel
  //    = max(investmentAmount - loanAmount, 0)
  // ───────────────────────────────────────────────────────────────────────────
  setupApport(fg: FormGroup, destroy$: Subject<void>): void {
    merge(
      ctrlChanges(fg.get('loanAmount')),
      ctrlChanges(fg.get('investmentAmount'))
    )
      .pipe(
        takeUntil(destroy$),
        map(() => {
          const loan = toNum(fg.get('loanAmount')?.value);
          const inv = toNum(fg.get('investmentAmount')?.value);
          return Math.max(inv - loan, 0);
        })
      )
      .subscribe((apport) => {
        setNum(fg.get('apport'), apport);
      });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Pourcentage d'apport
  //    = (apport / investmentAmount) × 100
  // ───────────────────────────────────────────────────────────────────────────
  setupPercentOfApport(fg: FormGroup, destroy$: Subject<void>): void {
    merge(
      ctrlChanges(fg.get('apport')),
      ctrlChanges(fg.get('investmentAmount'))
    )
      .pipe(
        takeUntil(destroy$),
        map(() => {
          const apport = toNum(fg.get('apport')?.value);
          const inv = toNum(fg.get('investmentAmount')?.value);
          return inv > 0 ? NumberUtils.round((apport * 100) / inv, 2) : 0;
        })
      )
      .subscribe((pct) => {
        setNum(fg.get('percentOfApport'), pct);
      });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Logement social (Fogarim / Fogaloge uniquement)
  //    area entre 50 et 80 m² → socialHousing = true
  // ───────────────────────────────────────────────────────────────────────────
  setupSocialHousing(fg: FormGroup, destroy$: Subject<void>): void {
    ctrlChanges(fg.get('area'), 600)
      .pipe(takeUntil(destroy$))
      .subscribe((value) => {
        if (value) {
          fg.get('socialHousing')?.setValue(!(value < 50 || value > 80));
        } else {
          fg.get('monthlyCoefficient')?.reset();
        }
      });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Coefficient mensuel CCG (Fogarim / Fogaloge uniquement)
  //    Appel HTTP via calculateCCGCommission — switchMap pour éviter les races
  // ───────────────────────────────────────────────────────────────────────────
  setupMonthlyCoefficient(
    fg: FormGroup,
    ctx: LoanCalculationContext,
    destroy$: Subject<void>
  ): void {
    const loanAmount$ = ctrlChanges(fg.get('loanAmount'), 400);
    const investmentAmount$ = ctrlChanges(fg.get('investmentAmount'), 400);
    const deadlineNumber$ = ctrlChanges(fg.get('deadlineNumber'), 400);
    const loanRate$ = ctrlChanges(fg.get('rate'), 400);
    const ccgCommissionChargeType$ = ctrlChanges(fg.get('ccgCommissionChargeType'), 400);
    const socialHousing$ = ctrlChanges(fg.get('socialHousing'), 400);
    const area$ = ctrlChanges(fg.get('area'), 400);

    combineLatest([
      loanAmount$,
      investmentAmount$,
      deadlineNumber$,
      loanRate$,
      ccgCommissionChargeType$,
      socialHousing$,
      area$,
    ])
      .pipe(
        takeUntil(destroy$),
        map(
          ([
            loanAmount,
            investmentAmount,
            deadlineNumber,
            loanRate,
            ccgCommissionChargeType,
            socialHousing,
            areaHousing,
          ]) => ({
            loanAmount: toNum(loanAmount),
            investmentAmount: toNum(investmentAmount),
            loanRate: toNum(loanRate),
            duration: toNum(deadlineNumber),
            isSocialHousing: socialHousing,
            codeProduct: ctx.productCode,
            ccgCommissionChargeType,
            areaHousing,
          })
        ),
        filter((req) => this.isAllFieldsValid(req)),
        // switchMap annule l'appel précédent si les valeurs changent avant la réponse
        switchMap((req) => this.dossierDataService.calculateCCGCommission(req))
      )
      .subscribe((ccgData: CcgCommessionMatrix) => {
        this.dossierStore.update({ ccgCommessionMatrix: ccgData }, true, false);
        fg.get('monthlyCoefficient')?.setValue(ccgData?.ccgCommission);
      });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Méthodes utilitaires publiques (appelables depuis le composant si besoin)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Recalcule le montant du prêt à la demande (ex: après changement de contexte ClipriMRE).
   * Retourne la somme sans side-effect.
   */
  computeLoanSum(fg: FormGroup, ctx: LoanCalculationContext): number {
    const build = toNum(fg.get('claimedAmountOfBuildDevelopment')?.value);
    const purchase = toNum(fg.get('claimedAmountOfPurchase')?.value);
    const notary = ctx.isNotaryFeesActive()
      ? toNum(fg.get('requestedNotaryFee')?.value)
      : 0;
    return build + purchase + notary;
  }

  /**
   * Recalcule le montant d'investissement à la demande.
   */
  computeInvestmentAmount(fg: FormGroup, ctx: LoanCalculationContext): number {
    const price = toNum(fg.get('acquisitionPrice')?.value);
    const quotation = toNum(fg.get('buildDevelopmentQuotation')?.value);
    const fee = ctx.isNotaryFeesActive()
      ? toNum(fg.get('acquisitionFee')?.value)
      : 0;
    return price + quotation + fee;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Privé
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Vérifie que tous les champs de l'objet sont renseignés et non-zéro
   * (sauf isSocialHousing qui peut être false).
   *
   * Note: loanRate peut être 0 pour des produits subventionnés — on exclut
   * isSocialHousing du check numérique pour ne pas bloquer le calcul quand
   * socialHousing === false.
   */
  private isAllFieldsValid(obj: Record<string, any>): boolean {
    if (!obj || typeof obj !== 'object') return false;
    return Object.entries(obj).every(([key, value]) => {
      if (value === null || value === undefined) return false;
      // Les booléens (isSocialHousing) sont toujours valides
      if (typeof value === 'boolean') return true;
      // Les objets (ccgCommissionChargeType) doivent exister
      if (typeof value === 'object') return true;
      // Les nombres : on accepte 0 pour loanRate (produits subventionnés)
      if (typeof value === 'number') return key === 'loanRate' || value !== 0;
      // Les strings
      return value !== '';
    });
  }
}
