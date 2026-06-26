import { Injectable } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, Validators } from '@angular/forms';
import { Subject, merge } from 'rxjs';
import {
  debounceTime,
  distinctUntilChanged,
  startWith,
  takeUntil,
} from 'rxjs/operators';
import { MechanismType, Products } from '@core/models';
import { RateTypes } from '@core/models/rate-type';
import { NumberValidators } from '@octroi-credit-common';
import { DossierDataStoreService } from '@core/services';
import { NumberUtils } from '@core/util/number-utils';
import {
  equalToMechanismSumValidator,
  perLessThanEqualToSumOfAmountsValidator,
  LoanValidatorContext,
} from './loan-data.validators';

// ─────────────────────────────────────────────────────────────────────────────
// Contexte produit passé par le composant
// ─────────────────────────────────────────────────────────────────────────────

export interface LoanBusinessRulesContext {
  // Flags produit
  isFogarim: boolean;
  isFogaloge: boolean;
  isImtilak: boolean;
  isImtilakPPR: boolean;
  isAdlSakane: boolean;
  isAdlSakanePPR: boolean;
  isSalafBaytiSante: boolean;
  isSalafBaytiSantePPR: boolean;
  isVeFa: boolean;
  isMoulkia: boolean;
  isPPIProduct: boolean;
  isPpiMRE: boolean;

  // Fonctions dynamiques (relues à chaque émission)
  isNotaryFeesActive: () => boolean;
  isItABuildingLotAcquisition: () => boolean;
  isMechanismSelected: () => boolean;
  isMechanism1: () => boolean;
  isMechanism2: () => boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class LoanDataBusinessRulesService {

  constructor(private dossierStore: DossierDataStoreService) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Point d'entrée principal
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Branche toutes les règles métier réactives sur le FormGroup.
   * Toutes les subscriptions sont détruites via destroy$.
   */
  setupAll(
    fg: FormGroup,
    ctx: LoanBusinessRulesContext,
    destroy$: Subject<void>
  ): void {
    this.setupDelayedRules(fg, destroy$);
    this.setupRateTypeRules(fg, destroy$);
    this.setupPeriodicityRules(fg, destroy$);
    this.setupLoanObjectRules(fg, ctx, destroy$);
    this.setupAmountValidationRules(fg, ctx, destroy$);

    if (ctx.isImtilak || ctx.isImtilakPPR || ctx.isAdlSakane || ctx.isAdlSakanePPR || ctx.isSalafBaytiSante || ctx.isSalafBaytiSantePPR) {
      this.setupSalafBaytiSanteRates(fg, ctx, destroy$);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Règle "delayed"
  //    true  → delayType + delayDuration deviennent required
  //    false → reset + suppression required
  // ───────────────────────────────────────────────────────────────────────────
  setupDelayedRules(fg: FormGroup, destroy$: Subject<void>): void {
    const delayed = fg.get('delayed');
    const delayType = fg.get('delayType');
    const delayDuration = fg.get('delayDuration');

    if (!delayed || !delayType || !delayDuration) return;

    delayed.valueChanges
      .pipe(takeUntil(destroy$))
      .subscribe((value: boolean) => {
        if (value) {
          delayType.addValidators(Validators.required);
          delayDuration.addValidators(Validators.required);
        } else {
          delayType.removeValidators(Validators.required);
          delayType.reset();
          delayDuration.removeValidators(Validators.required);
          delayDuration.reset();
        }
        delayType.updateValueAndValidity();
        delayDuration.updateValueAndValidity();
      });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Règle "rateType"
  //    CAPE → cappedRate devient required + doit être >= rate
  //    autre → reset cappedRate
  // ───────────────────────────────────────────────────────────────────────────
  setupRateTypeRules(fg: FormGroup, destroy$: Subject<void>): void {
    const rateType = fg.get('rateType');
    const cappedRate = fg.get('cappedRate');

    if (!rateType || !cappedRate) return;

    rateType.valueChanges
      .pipe(takeUntil(destroy$))
      .subscribe((value: any) => {
        const isCape = value?.code === RateTypes.CAPE || value === RateTypes.CAPE;

        if (isCape) {
          cappedRate.addValidators([
            Validators.required,
            NumberValidators.greaterThanEqualTo({ fieldName: 'rate' }),
          ]);
        } else {
          cappedRate.removeValidators([
            Validators.required,
            NumberValidators.greaterThanEqualTo({ fieldName: 'rate' }),
          ]);
          cappedRate.reset();
        }
        cappedRate.updateValueAndValidity();
      });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Règle "periodicity"
  //    Tout changement de périodicité → revalide deadlineNumber
  //    (car deadlineNumber a un validator lessThanEqualToWithCases basé sur periodicity)
  // ───────────────────────────────────────────────────────────────────────────
  setupPeriodicityRules(fg: FormGroup, destroy$: Subject<void>): void {
    const periodicity = fg.get('periodicity');
    const deadlineNumber = fg.get('deadlineNumber');

    if (!periodicity || !deadlineNumber) return;

    periodicity.valueChanges
      .pipe(takeUntil(destroy$))
      .subscribe(() => {
        deadlineNumber.updateValueAndValidity();
      });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Règle "loanObject"
  //    Conditionne les validators de :
  //      - claimedAmountOfPurchase    (code RCH ou AQS)
  //      - buildDevelopmentQuotation  (code CST ou AMN)
  //      - claimedAmountOfBuild       (code CST ou AMN)
  //      - repurchaseType             (code RCH)
  // ───────────────────────────────────────────────────────────────────────────
  setupLoanObjectRules(
    fg: FormGroup,
    ctx: LoanBusinessRulesContext,
    destroy$: Subject<void>
  ): void {
    const loanObject = fg.get('loanObject');
    if (!loanObject) return;

    loanObject.valueChanges
      .pipe(takeUntil(destroy$))
      .subscribe((value: any) => {
        const code: string = value?.code ?? '';

        this.applyPurchaseValidators(fg, code);
        this.applyBuildValidators(fg, code);
        this.applyRepurchaseValidators(fg, code);
      });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Règle "validateAmounts"
  //    Surveille les montants (build, purchase, additionalCredit, mécanismes)
  //    → ajoute les validators de cohérence mécanisme quand un mécanisme est sélectionné
  // ───────────────────────────────────────────────────────────────────────────
  setupAmountValidationRules(
    fg: FormGroup,
    ctx: LoanBusinessRulesContext,
    destroy$: Subject<void>
  ): void {
    const baseControls = [
      'claimedAmountOfBuildDevelopment',
      'claimedAmountOfPurchase',
      'additionalCredit',
    ];
    const extraControls: string[] = [];

    if (ctx.isImtilak || ctx.isImtilakPPR) {
      extraControls.push('subsidizedCreditAmount', 'bonusCreditAmount', 'suportedCreditAmount');
    }
    if (ctx.isSalafBaytiSante || ctx.isSalafBaytiSantePPR) {
      extraControls.push('bonusCreditAmount');
    }
    if (ctx.isAdlSakane || ctx.isAdlSakanePPR) {
      extraControls.push('typeAloanAmount', 'typeBloanAmount');
    }

    const controlNames = [...new Set([...baseControls, ...extraControls])];

    // Construit un validatorContext pour les custom validators
    const validatorCtx: LoanValidatorContext = {
      getFormGroup: () => fg,
      dossierStore: this.dossierStore,
    };

    // On merge les valueChanges de tous les controls pertinents
    const changes$ = controlNames
      .map((name) => fg.get(name))
      .filter((ctrl): ctrl is AbstractControl => !!ctrl)
      .map((ctrl) => ctrl.valueChanges.pipe(debounceTime(400), startWith(ctrl.value)));

    if (changes$.length === 0) return;

    // On utilise merge au lieu de combineLatest pour réagir à chaque changement
    merge(...changes$)
      .pipe(takeUntil(destroy$))
      .subscribe(() => {
        if (!ctx.isMechanismSelected()) return;

        // claimedAmountOfPurchase ≤ somme des mécanismes
        const purchaseCtrl = fg.get('claimedAmountOfPurchase');
        if (purchaseCtrl) {
          purchaseCtrl.addValidators([perLessThanEqualToSumOfAmountsValidator(validatorCtx)]);
          purchaseCtrl.updateValueAndValidity({ emitEvent: false });
        }

        // claimedAmountOfBuild == somme mécanismes (si CST ou AMN)
        const loanCode: string = fg.get('loanObject')?.value?.code ?? '';
        const claimedBuild = fg.get('claimedAmountOfBuildDevelopment');
        if (claimedBuild && (loanCode.includes('CST') || loanCode.includes('AMN'))) {
          claimedBuild.addValidators([equalToMechanismSumValidator(validatorCtx)]);
          claimedBuild.updateValueAndValidity({ emitEvent: false });
        }
      });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Taux automatiques SalafBaytiSante
  //    bonusCreditDuration   → bonusCreditRate
  //    additionalLoanDuration → additionalCreditRate
  // ───────────────────────────────────────────────────────────────────────────
  setupSalafBaytiSanteRates(
    fg: FormGroup,
    ctx: LoanBusinessRulesContext,
    destroy$: Subject<void>
  ): void {
    if (!ctx.isSalafBaytiSante && !ctx.isSalafBaytiSantePPR) return;

    const bonusDuration = fg.get('bonusCreditDuration');
    const additionalDuration = fg.get('additionalLoanDuration');

    if (!bonusDuration || !additionalDuration) return;

    merge(
      bonusDuration.valueChanges.pipe(startWith(bonusDuration.value), debounceTime(200), distinctUntilChanged()),
      additionalDuration.valueChanges.pipe(startWith(additionalDuration.value), debounceTime(200), distinctUntilChanged())
    )
      .pipe(takeUntil(destroy$))
      .subscribe(() => {
        const durationBonus = bonusDuration.value;
        const durationAdditional = additionalDuration.value;

        const bonusRate = this.getSalafBaytiSanteRate('bonus', durationBonus);
        const additionalRate = this.getSalafBaytiSanteRate('additional', durationAdditional);

        if (bonusRate !== null) {
          this.setNum(fg.get('bonusCreditRate'), bonusRate);
        }
        if (additionalRate !== null) {
          this.setNum(fg.get('additionalCreditRate'), additionalRate);
        }
      });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Privé — helpers
  // ───────────────────────────────────────────────────────────────────────────

  private applyPurchaseValidators(fg: FormGroup, code: string): void {
    const ctrl = fg.get('claimedAmountOfPurchase');
    if (!ctrl) return;

    if (code.includes('RCH') || code.includes('AQS')) {
      ctrl.addValidators([
        Validators.required,
        NumberValidators.lessThanEqualTo({ fieldName: 'acquisitionPrice' }),
      ]);
    } else {
      ctrl.removeValidators(Validators.required);
      ctrl.reset();
    }
    ctrl.updateValueAndValidity();
  }

  private applyBuildValidators(fg: FormGroup, code: string): void {
    const quotation = fg.get('buildDevelopmentQuotation');
    const build = fg.get('claimedAmountOfBuildDevelopment');

    if (!quotation || !build) return;

    if (code.includes('CST') || code.includes('AMN')) {
      quotation.addValidators(Validators.required);
      build.addValidators(Validators.required);
    } else {
      quotation.removeValidators(Validators.required);
      quotation.reset();
      build.removeValidators(Validators.required);
      build.reset();
    }
    quotation.updateValueAndValidity();
    build.updateValueAndValidity();
  }

  private applyRepurchaseValidators(fg: FormGroup, code: string): void {
    const ctrl = fg.get('repurchaseType');
    if (!ctrl) return;

    if (code.includes('RCH')) {
      ctrl.addValidators(Validators.required);
    } else {
      ctrl.removeValidators(Validators.required);
    }
    ctrl.updateValueAndValidity();
  }

  /**
   * Taux SalafBaytiSante selon la durée en mois.
   *   bonus      : 1.70 / 2.00 / 2.25
   *   additional : 4.20 / 4.50 / 4.75
   */
  private getSalafBaytiSanteRate(
    type: 'bonus' | 'additional',
    duration: number | null
  ): number | null {
    if (duration == null) return null;

    const brackets =
      type === 'bonus'
        ? [
            { max: 84,  rate: 1.70 },
            { max: 180, rate: 2.00 },
            { max: 240, rate: 2.25 },
          ]
        : [
            { max: 84,  rate: 4.20 },
            { max: 180, rate: 4.50 },
            { max: 240, rate: 4.75 },
          ];

    const bracket = brackets.find((b) => duration < b.max) ?? brackets[brackets.length - 1];
    return bracket.rate;
  }

  private setNum(ctrl: AbstractControl | null | undefined, value: number): void {
    if (!ctrl) return;
    ctrl.setValue(NumberUtils.round(value, 2), { emitEvent: true });
  }
}


// Validators


import { AbstractControl, FormGroup, ValidatorFn, ValidationErrors } from '@angular/forms';
import { NumberUtils } from '@core/util/number-utils';
import { MechanismType } from '@core/models';
import { DossierDataStoreService } from '@core/services';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function toNum(value: any): number {
  return NumberUtils.toForcedNumber(value);
}

// ─────────────────────────────────────────────────────────────────────────────
// Contexte injecté dans les factories qui ont besoin du FormGroup ou du store
// ─────────────────────────────────────────────────────────────────────────────

export interface LoanValidatorContext {
  getFormGroup: () => FormGroup;
  dossierStore: DossierDataStoreService;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Validator groupe — montant minimum du prêt
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Appliqué sur le FormGroup.
 * Erreur { loanAmountInvalid } si loanAmount < 100.
 */
export function loanAmountGroupValidator(): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const fg = group as FormGroup;
    const loanAmount = fg.getRawValue()?.loanAmount;

    if (loanAmount == null) return null;
    if (loanAmount < 100) return { loanAmountInvalid: { loanAmount } };
    return null;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Validator groupe — numéro de crédit racheté
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Appliqué sur le FormGroup.
 * Actif uniquement si loanObject.code inclut 'AQS_RCH'.
 * Erreurs : { repurchasedCreditNumberRequired } | { repurchasedCreditNotFound }
 */
export function repurchasedCreditNumberValidator(
  ctx: Pick<LoanValidatorContext, 'dossierStore'>
): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const fg = group as FormGroup;

    const loanObjectCode: string = fg.get('loanObject')?.value?.code ?? '';
    if (!loanObjectCode.includes('AQS_RCH')) return null;

    const value = (fg.get('repurchasedCreditNumber')?.value ?? '').toString().trim();
    if (!value) return { repurchasedCreditNumberRequired: true };

    const debts = ctx.dossierStore.get()?.debts ?? [];
    const found = debts.some((d: any) => {
      const fileNumber = (d?.fileNumber ?? '').toString().trim();
      const establishmentCode = (d?.establishmentCode ?? '').toString().trim();
      const codeProductFamily = (d?.codeProductFamily ?? '').toString().trim();
      return (
        fileNumber === value &&
        establishmentCode === '022' &&
        codeProductFamily.toUpperCase() === 'PPO-PPC'
      );
    });

    return found ? null : { repurchasedCreditNotFound: true };
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Validator control — loanAmount <= sumOfMechanismAmounts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Appliqué sur le control loanAmount.
 * Erreur { lessThanEqualToSumOfAmounts } si la somme des mécanismes dépasse le montant du prêt.
 * Retourne null si aucun mécanisme sélectionné (sum === -1).
 */
export function lessThanEqualToSumOfAmountsValidator(
  ctx: LoanValidatorContext
): ValidatorFn {
  return (_control: AbstractControl): ValidationErrors | null => {
    const fg = ctx.getFormGroup();
    const loanAmount = toNum(fg.get('loanAmount')?.value);
    const sumOfAmounts = getSumOfMechanismAmounts(fg);

    if (sumOfAmounts === -1) return null;
    return sumOfAmounts <= loanAmount ? null : { lessThanEqualToSumOfAmounts: true };
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Validator control — claimedAmountOfPurchase <= sumOfMechanismAmounts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Appliqué sur le control claimedAmountOfPurchase.
 * Erreur { lessThanEqualToSumOfAmounts } si le montant saisi dépasse la somme des mécanismes.
 * Retourne null si aucun mécanisme sélectionné (sum === -1).
 */
export function perLessThanEqualToSumOfAmountsValidator(
  ctx: LoanValidatorContext
): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const loanAmount = toNum(control?.value);
    const sumOfAmounts = getSumOfMechanismAmounts(ctx.getFormGroup());

    if (sumOfAmounts === -1) return null;
    return sumOfAmounts >= loanAmount ? null : { lessThanEqualToSumOfAmounts: true };
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Validator control — claimedAmountOfBuildDevelopment == sumOfMechanismAmounts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Appliqué sur claimedAmountOfBuildDevelopment pour les loanObject CST/AMN avec mécanismes.
 * Erreur { equalToMechanismSum: { expected, actual } } si la somme ne correspond pas.
 */
export function equalToMechanismSumValidator(
  ctx: LoanValidatorContext
): ValidatorFn {
  return (_control: AbstractControl): ValidationErrors | null => {
    const fg = ctx.getFormGroup();
    const loanCode: string = fg.get('loanObject')?.value?.code ?? '';

    const dev = fg.get('claimedAmountOfBuildDevelopment')?.value;
    const pur = fg.get('claimedAmountOfPurchase')?.value;

    let totalEntered: number;

    if (loanCode.includes('AQS')) {
      if (dev == null || pur == null) return { equalToMechanismSum: 'incomplete' };
      totalEntered = toNum(dev) + toNum(pur);
    } else {
      if (dev == null) return { equalToMechanismSum: 'incomplete' };
      totalEntered = toNum(dev);
    }

    const expectedSum = getSumOfMechanismAmounts(fg);
    if (expectedSum === -1) return null;

    return totalEntered === expectedSum
      ? null
      : { equalToMechanismSum: { expected: expectedSum, actual: totalEntered } };
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper — calcul de la somme des montants de mécanisme
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retourne la somme des montants selon les mécanismes sélectionnés.
 * Retourne -1 si un des champs requis est null/vide (validation ignorée).
 *
 * Mapping mécanisme → controls concernés :
 *   MECHANISM_1 → subsidizedCreditAmount + additionalCredit
 *   MECHANISM_2 → bonusCreditAmount      + additionalCredit
 *   MECHANISM_3 → suportedCreditAmount
 *   TYPE_A      → typeAloanAmount        + additionalCredit
 *   TYPE_B      → typeBloanAmount        + additionalCredit
 */
export function getSumOfMechanismAmounts(fg: FormGroup): number {
  const selectedMechanisms = fg.get('mechanisms')?.value;

  const mechanismControlsMap: Record<string, string[]> = {
    [MechanismType.MECHANISM_1]: ['subsidizedCreditAmount', 'additionalCredit'],
    [MechanismType.MECHANISM_2]: ['bonusCreditAmount', 'additionalCredit'],
    [MechanismType.MECHANISM_3]: ['suportedCreditAmount'],
    [MechanismType.TYPE_A]:      ['typeAloanAmount', 'additionalCredit'],
    [MechanismType.TYPE_B]:      ['typeBloanAmount', 'additionalCredit'],
  };

  const selectedArray: any[] = Array.isArray(selectedMechanisms)
    ? selectedMechanisms
    : selectedMechanisms
    ? [selectedMechanisms]
    : [];

  // Déduplique les noms de controls (ex: additionalCredit présent dans plusieurs mécanismes)
  const controlNames = Array.from(
    new Set(selectedArray.flatMap(({ code }) => mechanismControlsMap[code] ?? []))
  );

  if (controlNames.length === 0) return -1;

  // Si un champ requis est vide → on suspend la validation
  const hasEmpty = controlNames.some((name) => {
    const value = fg.get(name)?.value;
    return value === null || value === undefined || value === '';
  });
  if (hasEmpty) return -1;

  return controlNames.reduce(
    (acc, name) => acc + toNum(fg.get(name)?.value),
    0
  );
}







// Loan calculation

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
