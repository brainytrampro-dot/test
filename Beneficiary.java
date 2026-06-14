
private void syncWarranties(DossierData oldDossier, DossierData newDossier) {
    if (newDossier.getWarranties() == null) {
        oldDossier.getWarranties().clear();
        return;
    }

    List<String> resetStatuses = Arrays.asList(
        DossierStatus.INIT.toString(),
        DossierStatus.INCA_VALD.toString(),
        DossierStatus.INCA_DECS.toString(),
        DossierStatus.INCA_AANR.toString(),
        DossierStatus.INCA_AVRS_RANR.toString(),
        DossierStatus.INCA_AVRS.toString(),
        DossierStatus.INCA_DECS_RS.toString()
    );

    if (resetStatuses.contains(oldDossier.getStatus())) {
        oldDossier.getWarranties().clear();
        newDossier.getWarranties().forEach(w -> {
            Warranty toAdd = new Warranty();
            toAdd.setContent(w.getContent());
            toAdd.setType(w.getType());
            toAdd.setDossier(oldDossier);
            oldDossier.getWarranties().add(toAdd);
        });
        return;
    }

    // Sync partiel
    Map<Long, Warranty> oldWarrantiesMap = oldDossier.getWarranties().stream()
        .filter(w -> w.getId() != null)
        .collect(Collectors.toMap(Warranty::getId, w -> w));

    Set<Long> newWarrantyIds = newDossier.getWarranties().stream()
        .map(Warranty::getId)
        .filter(Objects::nonNull)
        .collect(Collectors.toSet());

    // Supprime les obsolètes
    oldDossier.getWarranties().removeIf(w ->
        w.getId() != null && !newWarrantyIds.contains(w.getId())
    );

    // Update ou Insert
    List<Warranty> toAdd = new ArrayList<>();
    for (Warranty newW : newDossier.getWarranties()) {
        if (newW.getId() != null && oldWarrantiesMap.containsKey(newW.getId())) {
            Warranty existing = oldWarrantiesMap.get(newW.getId());
            existing.setContent(newW.getContent());
            existing.setType(newW.getType());
        } else {
            Warranty warranty = new Warranty();
            warranty.setContent(newW.getContent());
            warranty.setType(newW.getType());
            warranty.setDossier(oldDossier);
            toAdd.add(warranty);
        }
    }

    oldDossier.getWarranties().addAll(toAdd);
}











import { CdkStepper } from '@angular/cdk/stepper';
import {
  AfterViewInit,
  Component,
  EventEmitter,
  Injector,
  Input,
  OnInit,
  Output,
  ViewChild,
} from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  Validators,
  ValidatorFn,
  FormArray,
  ValidationErrors,
} from '@angular/forms';
import {
  CodeLabel,
  DelayType,
  DossierData,
  LoanData,
  Mechanism,
  MechanismType,
  Products,
  PropertyData,
  RateType,
  RefCity,
  Warranty,
  WarrantyType,
} from '@core/models';
import { BehaviorSubject, combineLatest, Observable } from 'rxjs';
import { distinctUntilChanged, debounceTime, map, startWith, takeUntil } from 'rxjs/operators';
import { BaseComponent } from '@shared/components';
import { TopVipService } from '@loan-dossier/services';
import { DossierDataService, DossierDataStoreService, ReferentialService } from '@core/services';
import { SelectSearchService } from '@loan-dossier/services/select.service';
import { NumberUtils, ObjectUtils } from '@core/util';
import { DialogMessageService } from '@octroi-credit-common';
import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { RateTypes } from '@core/models/rate-type';
import { MatChipInputEvent } from '@angular/material/chips';
import { NumberValidators } from '@shared/validators';
import { AccordType } from '@core/models/Accord';
import { UserService } from '@core/services/user.service';
import { Role } from '@core/constants';

@Component({
  selector: 'app-back-decsion-stepper',
  templateUrl: './back-decsion-stepper.component.html',
  styleUrls: ['./back-decsion-stepper.component.scss'],
})
export class BackToDecisionStepperComponent extends BaseComponent implements OnInit, AfterViewInit {

  // ─── State ───────────────────────────────────────────────────────────────────

  dossierData!: DossierData;
  formGroup!: FormGroup;
  rateTypes = RateTypes;

  // Loan context (populated from @Input data in ngOnInit)
  loanObject!: string;
  acquisitionPrice!: number;
  acquisitionFee!: number;
  buildDevelopmentQuotation!: number;
  requestedNotaryFee!: number;
  claimedAmountOfPurchase!: number;
  claimedAmountOfBuildDevelopment!: number;
  propertyType!: string;
  periodicity!: string;
  maxDeadline!: number;

  // Product / mechanism flags
  selectedProduct!: CodeLabel;
  selectedMechanism: CodeLabel[] = [];
  isImtilak!: boolean;
  isImtilakPPR!: boolean;
  isSalafBaytiSante!: boolean;
  isSalafBaytiSantePPR!: boolean;
  isAdlSakane!: boolean;
  isAdlSakanePPR!: boolean;
  isPPIProduct!: boolean;
  isFogarim!: boolean;
  isFogaloge!: boolean;
  isClipriMRE!: boolean;
  isYassir!: boolean;
  isPpoPpc!: boolean;

  // UI state
  valuesHasChanged = false;
  warranties: Warranty[] = [];
  addOnBlur = true;
  removableWarranty = true;
  selectableWarranty = true;
  readonly separatorKeysCodes = [ENTER, COMMA] as const;
  stepsVisited: boolean[] = [true, ...new Array(6).fill(false)];
  accord: string | undefined;
  isProspect = false;
  isAccord: any;
  isCtb = false;

  // Observables
  rateTypes$!: Observable<CodeLabel[]>;
  dossierData$!: Observable<DossierData>;
  delayTypes$?: Observable<DelayType[]>;
  filteredRateTypes$?: Observable<RateType[]>;
  filteredDelayTypes$?: Observable<DelayType[]>;
  cities$?: Observable<RefCity[]>;
  insuranceCoefficient$: BehaviorSubject<number> = new BehaviorSubject<number>(0);
  aditionalCreditnsuranceCoefficient$: BehaviorSubject<number> = new BehaviorSubject<number>(0);

  // Filter controls (mat-select-search)
  rateTypeFilterControl = new FormControl();
  delayTypeFilterControl = new FormControl();

  // Notary sub-group (used only for template grouping, shares reference with formGroup)
  propertyDataNotaryFormGroup!: FormGroup;

  // ── TODO: vérifier si `count` et `originalData` sont utilisés dans le template ──
  // count = 1;
  // originalData!: any;

  private readonly maxDeadlineValues: Map<string, number> = new Map([
    ['MONTHLY', 120],
    ['ANNUAL', 10],
    ['BIMONTHLY', 240],
    ['QUARTERLY', 40],
  ]);

  private oldPropertyData: any;
  private warrantiesSubject = new BehaviorSubject<Warranty[]>([]);

  // ─── I/O ─────────────────────────────────────────────────────────────────────

  @Input() data: any = {};
  @Output() returnToDecision = new EventEmitter<any>();
  @ViewChild('principalStepper') principalStepper!: CdkStepper;

  // ─── Constructor ─────────────────────────────────────────────────────────────

  constructor(
    private dossierStore: DossierDataStoreService,
    public dossierDataService: DossierDataService,
    public topVipService: TopVipService,
    public refService: ReferentialService,
    public selectService: SelectSearchService,
    public dialogMessageService: DialogMessageService,
    userService: UserService,
    injector: Injector,
  ) {
    super(injector);
    this.isCtb = userService.hasRole([Role.CTB]);
    this.oldPropertyData = this.dossierStore.get()?.propertyData;
    this.cities$ = this.refService.getCities();
    this.delayTypes$ = this.refService.mapToCodeDesignation(this.refService.getAllDelayTypes());
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  ngOnInit(): void {
    const dossier = this.dossierStore.get();
    this.accord = dossier?.accord;
    this.isProspect = !!dossier?.customerData?.personalInfo?.prospect;

    this.refService.getAllPropertyTypes();
    this.rateTypes$ = this.refService.mapToCodeDesignation(this.refService.getAllRateTypes());

    // ── Loan context ──
    this.loanObject = this.data.loanData.loanObject.code;
    this.acquisitionFee = this.data.loanData.acquisitionFee;
    this.acquisitionPrice = this.data.loanData.acquisitionPrice;
    this.requestedNotaryFee = this.data.loanData.requestedNotaryFee;
    this.claimedAmountOfPurchase = this.data.loanData.claimedAmountOfPurchase;
    this.claimedAmountOfBuildDevelopment = this.data.loanData.claimedAmountOfBuildDevelopment;
    this.buildDevelopmentQuotation = this.data.loanData.buildDevelopmentQuotation;
    this.propertyType = this.data.loanData?.propertyType?.code;
    this.periodicity = this.data.loanData?.periodicity?.code;
    this.maxDeadline = this.maxDeadlineValues.get(this.periodicity) ?? 0;

    // ── Product / mechanism flags ──
    this.selectedProduct = this.data.product;
    this.selectedMechanism = this.data.loanData?.mechanisms ?? [];
    this.isFogarim = this.isSelectedProduct(Products.FOGARIM);
    this.isFogaloge = this.isSelectedProduct(Products.FOGALOGE);
    this.isPPIProduct = this.isSelectedProductIn([Products.PPI_CLASSIQUE, Products.PPI_PPR_FONC]);
    this.isImtilak = this.isSelectedProduct(Products.IMTILAK);
    this.isImtilakPPR = this.isSelectedProduct(Products.IMTILAK_PPR);
    this.isAdlSakane = this.isSelectedProduct(Products.ADL_SAKANE);
    this.isAdlSakanePPR = this.isSelectedProduct(Products.ADL_SAKANE_PPR);
    this.isSalafBaytiSante = this.isSelectedProduct(Products.SALAF_BAYTI_SANTE);
    this.isSalafBaytiSantePPR = this.isSelectedProduct(Products.SALAF_BAYTI_SANTE_PPR);
    this.isClipriMRE = this.data.personalInfo?.market === 'MCH/01PRI';
    this.isYassir = this.isSelectedProductIn([Products.YASSIR, Products.YASSIR_PPR]);
    this.isPpoPpc = this.isSelectedProductIn([Products.PPO, Products.PPO_PPR, Products.PPC]);
    this.isAccord = this.data?.accord;
    this.warranties = [...this.data.warranties];

    // ── Form init ──
    this.initFormGroup();
    this.initDelayedType();
    this.initDelayed();
    this.updateNotaryValidations();

    // ── Insurance coefficient patch ──
    this.patchInsuranceCoefficients();

    // ── Conditional validators ──
    if (this.isYassir || this.isPpoPpc) {
      this.initClaimedAmountOfPurchaseValidators();
    }
    if (!this.isSubventionedProduct()) {
      this.initCappedRateValidators();
    }
    if (this.isPPIProduct || this.isClipriMRE) {
      this.initAcquisitionPriceValidator();
    }

    // ── valueChanges subscriptions ──
    this.subscribeToInsuranceRateChanges();
    this.subscribeToFormValueChanges();

    // ── Filtered selects ──
    this.filteredRateTypes$ = this.selectService.filterOptions(this.rateTypes$ ?? [], this.rateTypeFilterControl, 'designation');
    this.filteredDelayTypes$ = this.selectService.filterOptions(this.delayTypes$ ?? [], this.delayTypeFilterControl, 'designation');

    // ── Duration listeners (Imtilak only) ──
    this.initDurationListeners();
  }

  ngAfterViewInit(): void {
    this.dossierStore.update({ propertyData: this.data?.propertyData });
    this.formGroup.patchValue(this.data);
    // this.originalData = this.formGroup.getRawValue(); // TODO: décommenter si utilisé dans le template
  }

  // ─── Form Initialization ─────────────────────────────────────────────────────

  initFormGroup(): void {
    this.formGroup = this.formBuilder.group({
      propertyData: this.formBuilder.group({
        properties: this.formBuilder.array([], this.minLengthArray(1)),
        coFinancing: new FormControl(),
      }),
      notary: this.formBuilder.group({
        name: new FormControl(null),
        address: new FormControl(null),
        phone: new FormControl(null, [Validators.pattern('^(0[0-9]{9}|\\+?[1-9]\\d{1,14})$')]),
        email: new FormControl(null, [Validators.email]),
      }),
      loanData: this.formBuilder.group({
        rateType: this.formBuilder.group({
          code: new FormControl(null, [Validators.required]),
        }),
        cappedRate: new FormControl(null),
        delayed: new FormControl(false),
        delayType: new FormControl(),
        delayDuration: new FormControl(),
      }),
      insuranceData: this.formBuilder.group({}),
      beneficiaries: this.formBuilder.array([], this.minLengthArray(1)),
      guarantors: this.formBuilder.array([]),
      representatives: this.formBuilder.array([]),
    });

    this.addLoanDataControls();
    this.initInsuranceDataForm();
    this.addApplicationFeeControl();
    this.addRepurchaseControl();

    // Notary sub-group (groupement visuel uniquement — partage la référence du formGroup)
    this.propertyDataNotaryFormGroup = this.formBuilder.group({});
    this.propertyDataNotaryFormGroup.addControl('notary', this.formGroup.get('notary') as FormGroup);
  }

  /**
   * Ajoute les contrôles dynamiques dans loanData selon le produit / loanObject.
   */
  private addLoanDataControls(): void {
    const lg = this.loanDataFormGroup;

    // ── Taux & durée (tous sauf produits subventionnés) ──
    if (!this.isSubventionedProduct()) {
      // ⚠️ DOUBLON POTENTIEL : `rate` est aussi ajouté dans ngOnInit (~ligne 100 original).
      // Conserver UNIQUEMENT ici et supprimer l'ajout dans ngOnInit.
      lg.addControl('rate', new FormControl(null, [
        Validators.required,
        NumberValidators.lessThanEqualTo({ value: 100 }),
      ]));

      lg.addControl('deadlineNumber', new FormControl(null, [
        Validators.required,
        NumberValidators.sumLessThanEqualTo({ fieldNameToAdd: 'delayDuration', value: 300 }),
        NumberValidators.lessThanEqualTo({ conditionalExpression: () => this.isYasserProduct() || this.isPpoPpcProduct(), value: 36 }),
        NumberValidators.lessThanEqualTo({ conditionalExpression: () => this.isItABuildingLotAcquisition(), value: this.maxDeadline }),
      ]));
    }

    // ── Montants selon loanObject ──
    if (this.loanObject.includes('AMN') || this.loanObject.includes('CST')) {
      lg.addControl('claimedAmountOfBuildDevelopment', new FormControl(null, [
        Validators.required,
        NumberValidators.lessThanEqualTo({ value: this.buildDevelopmentQuotation }),
      ]));
    }

    if (this.loanObject.includes('RCH') || this.loanObject.includes('AQS') || this.isYassir || this.isPpoPpc) {
      lg.addControl('claimedAmountOfPurchase', new FormControl(null, [
        Validators.required,
        NumberValidators.lessThanEqualTo({
          value: NumberUtils.toForcedNumber(this.acquisitionFee) + NumberUtils.toForcedNumber(this.acquisitionPrice),
        }),
      ]));
    }

    // ── Frais de notaire (PPI / ClipriMRE, hors Fogarim/Fogaloge) ──
    // ⚠️ DOUBLON : dans le code original ce bloc apparaît 3 fois avec des valeurs limite différentes (0.08, 0.01, 0.08).
    // Vérifier avec l'équipe métier quelle est la limite correcte (0.08 ou 0.01) et ne garder qu'un seul addControl.
    if (!this.isFogarim && !this.isFogaloge && (this.isPPIProduct || this.isClipriMRE)) {
      lg.addControl('acquisitionFee', new FormControl());
      lg.addControl('requestedNotaryFee', new FormControl(null, [
        Validators.required,
        NumberValidators.lessThanEqualTo({ value: NumberUtils.toForcedNumber(this.acquisitionPrice) * 0.08 }),
        // TODO: la version originale avait aussi * 0.01 dans un second addControl — à clarifier métier
      ]));
    }

    // ── Produits subventionnés (Imtilak, ADL, SalafBayti) ──
    if (this.isSubventionedProduct()) {
      lg.addControl('additionalCredit', new FormControl());
      lg.addControl('additionalCreditRate', new FormControl());
      lg.addControl('additionalLoanDuration', new FormControl());

      if (this.isAdlSakane || this.isAdlSakanePPR) {
        this.addAdlSakaneControls(lg);
      }
      if (this.isSalafBaytiSante || this.isSalafBaytiSantePPR) {
        this.addSalafBaytiControls(lg);
      }
      if (this.isImtilak || this.isImtilakPPR) {
        this.addImtilakControls(lg);
      }
    }

    // ── Yassir / PPO-PPC : taux fixé à 0, disabled ──
    if (this.isYassir || this.isPpoPpc) {
      this.setControlNumberValue(this.rateFormControl, 0);
      this.rateFormControl?.disable();
      this.insuranceCoefficientFormControl?.disable();
    }

    // ── Rachat de crédit ──
    if (this.loanObject.includes('AQS_RCH')) {
      lg.addControl('repurchasedCreditNumber', new FormControl(null));
    }
  }

  private addAdlSakaneControls(lg: FormGroup): void {
    lg.addControl('typeAloanAmount', new FormControl(null, [NumberValidators.lessThanEqualTo({ value: 100000 })]));
    lg.addControl('typeBloanAmount', new FormControl(null, [NumberValidators.lessThanEqualTo({ value: 150000 })]));
    lg.addControl('typeAloanDuration', new FormControl(null, [NumberValidators.lessThanEqualTo({ value: 120 })]));
    lg.addControl('typeBloanDuration', new FormControl(null, [NumberValidators.lessThanEqualTo({ value: 240 })]));
    lg.addControl('typeAloanRate', new FormControl());
    lg.addControl('typeBloanRate', new FormControl());
    lg.addValidators(this.sumLoanAmountsValidator.bind(this));
  }

  private addSalafBaytiControls(lg: FormGroup): void {
    lg.addControl('bonusCreditAmount', new FormControl(null, [NumberValidators.lessThanEqualTo({ value: 300000 })]));
    lg.addControl('bonusCreditRate', new FormControl());
    lg.addControl('bonusCreditDuration', new FormControl(null, [
      Validators.required,
      NumberValidators.lessThanEqualTo({
        conditionalExpression: () => this.isMechanism2(),
        value: 240,
        extraFieldsToUpdateValidator: ['mechanism'],
      }),
    ]));
    lg.addValidators(this.sumCreditAmountsValidator.bind(this));
  }

  private addImtilakControls(lg: FormGroup): void {
    lg.addControl('subsidizedCreditAmount', new FormControl(null, [NumberValidators.lessThanEqualTo({ value: 300000 })]));
    lg.addControl('bonusCreditAmount', new FormControl(null, [NumberValidators.lessThanEqualTo({ value: 200000 })]));
    lg.addControl('suportedCreditAmount', new FormControl());
    lg.addControl('subsidizedCreditRate', new FormControl());
    lg.addControl('bonusCreditRate', new FormControl());
    lg.addControl('suportedCreditRate', new FormControl());
    lg.addControl('subsidizedCreditDuration', new FormControl());
    lg.addControl('bonusCreditDuration', new FormControl(null, [
      Validators.required,
      NumberValidators.lessThanEqualTo({
        conditionalExpression: () => this.isMechanism2(),
        value: 180,
        extraFieldsToUpdateValidator: ['mechanism'],
      }),
    ]));
    lg.addControl('suportedCreditDuration', new FormControl());
    lg.addValidators(this.sumCreditAmountsValidator.bind(this));
  }

  private addApplicationFeeControl(): void {
    this.loanDataFormGroup.addControl('applicationFee', new FormControl(null, [Validators.required]));
    this.loanDataFormGroup.addValidators([this.applicationFeesValidator]);
  }

  private addRepurchaseControl(): void {
    if (!this.loanObject.includes('AQS_RCH')) return;
    this.loanDataFormGroup.addValidators(this.repurchasedCreditNumberValidator());
    this.loanDataFormGroup.updateValueAndValidity({ emitEvent: false });
  }

  private initInsuranceDataForm(): void {
    const ig = this.formGroup.get('insuranceData') as FormGroup;

    if (!this.isSubventionedProduct()) {
      ig.addControl('insuredPercentage', new FormControl('', [Validators.required, NumberValidators.lessThanEqualTo({ value: 100 })]));
      ig.addControl('promotionalInsuranceRate', new FormControl());
      ig.addControl('insuranceCoefficient', new FormControl(null, [Validators.required]));
      return;
    }

    if (this.isMechanism1()) {
      ig.addControl('subsidizedInsuredPercentage', new FormControl('', [Validators.required, NumberValidators.lessThanEqualTo({ value: 100 })]));
      ig.addControl('subsidizedPromotionalInsuranceRate', new FormControl());
      ig.addControl('subsidizedInsuranceCoefficient', new FormControl(null, [Validators.required]));
    }
    if (this.isMechanism2()) {
      ig.addControl('bonusInsuredPercentage', new FormControl('', [Validators.required, NumberValidators.lessThanEqualTo({ value: 100 })]));
      ig.addControl('bonusPromotionalInsuranceRate', new FormControl());
      ig.addControl('bonusInsuranceCoefficient', new FormControl(null, [Validators.required]));
    }
    if (this.isMechanism3()) {
      ig.addControl('suportedInsuredPercentage', new FormControl('', [Validators.required, NumberValidators.lessThanEqualTo({ value: 100 })]));
      ig.addControl('suportedPromotionalInsuranceRate', new FormControl());
      ig.addControl('suportedInsuranceCoefficient', new FormControl(null, [Validators.required]));
    }
    if (this.isTypeA()) {
      ig.addControl('typeAInsuredPercentage', new FormControl('', [Validators.required, NumberValidators.lessThanEqualTo({ value: 100 })]));
      ig.addControl('typeAPromotionalInsuranceRate', new FormControl());
      ig.addControl('typeAInsuranceCoefficient', new FormControl(null, [Validators.required]));
    }
    if (this.isTypeB()) {
      ig.addControl('typeBInsuredPercentage', new FormControl('', [Validators.required, NumberValidators.lessThanEqualTo({ value: 100 })]));
      ig.addControl('typeBPromotionalInsuranceRate', new FormControl());
      ig.addControl('typeBInsuranceCoefficient', new FormControl(null, [Validators.required]));
    }

    // Crédit additionnel — toujours présent pour les produits subventionnés
    ig.addControl('aditionalCreditInsuredPercentage', new FormControl('', [Validators.required, NumberValidators.lessThanEqualTo({ value: 100 })]));
    ig.addControl('aditionalCreditPromotionalInsuranceRate', new FormControl());
    ig.addControl('aditionalCreditInsuranceCoefficient', new FormControl(null, [Validators.required]));
  }

  // ─── Insurance Coefficient Patch (ngOnInit) ───────────────────────────────────

  /**
   * Patch les coefficients d'assurance depuis les données initiales après création du form.
   */
  private patchInsuranceCoefficients(): void {
    const ins = this.data?.insuranceData;

    if (!this.isSubventionedProduct() && ins?.insuranceCoefficient) {
      this.insuranceCoefficientFormControl?.setValue(
        this.decimalPipe.transform(ins.insuranceCoefficient, '1.4-4')
      );
    }

    if (this.isMechanism1()) {
      this.subsidizedInsuranceCoefficientFormControl?.setValue(
        this.decimalPipe.transform(ins?.subsidizedInsuranceCoefficient, '1.4-4')
      );
    }
    if (this.isMechanism2()) {
      this.bonusInsuranceCoefficientFormControl?.setValue(
        this.decimalPipe.transform(ins?.bonusInsuranceCoefficient, '1.4-4')
      );
    }
    if (this.isMechanism3()) {
      this.suportedInsuranceCoefficientFormControl?.setValue(
        this.decimalPipe.transform(ins?.suportedInsuranceCoefficient, '1.4-4')
      );
    }
    if (this.isTypeA()) {
      this.typeAInsuranceCoefficientFormControl?.setValue(
        this.decimalPipe.transform(ins?.typeAInsuranceCoefficient, '1.4-4')
      );
    }
    if (this.isTypeB()) {
      this.typeBInsuranceCoefficientFormControl?.setValue(
        this.decimalPipe.transform(ins?.typeBInsuranceCoefficient, '1.4-4')
      );
    }
    if (this.isTypeB() || this.isTypeA() || this.isMechanism1() || this.isMechanism2()) {
      this.aditionalCreditInsuranceCoefficientFormControl?.setValue(
        this.decimalPipe.transform(ins?.aditionalCreditInsuranceCoefficient, '1.4-4')
      );
    }

    // Sync via BehaviorSubject (si utilisé en dehors)
    this.insuranceCoefficient$
      .pipe(takeUntil(this.destroy$))
      .subscribe(value => this.insuranceCoefficientFormControl?.setValue(value));
  }

  // ─── Subscriptions ────────────────────────────────────────────────────────────

  private subscribeToInsuranceRateChanges(): void {
    const subscribe = (path: string, fn: () => void) => {
      this.formGroup.get(path)?.valueChanges
        .pipe(takeUntil(this.destroy$))
        .subscribe(fn);
    };

    subscribe('insuranceData.promotionalInsuranceRate', () => this.calculateInsuranceCoefficient());
    subscribe('insuranceData.subsidizedPromotionalInsuranceRate', () => this.calculateSubsidizedInsuranceCoefficient());
    subscribe('insuranceData.bonusPromotionalInsuranceRate', () => this.calculateBonusInsuranceCoefficient());
    subscribe('insuranceData.suportedPromotionalInsuranceRate', () => this.calculateSuportedInsuranceCoefficient());
    subscribe('insuranceData.typeAPromotionalInsuranceRate', () => this.calculateTypeAInsuranceCoefficient());
    subscribe('insuranceData.typeBPromotionalInsuranceRate', () => this.calculateTypeBInsuranceCoefficient());
    subscribe('insuranceData.aditionalCreditPromotionalInsuranceRate', () => this.calculateAdditionalInsuranceCoefficient());
  }

  private subscribeToFormValueChanges(): void {
    this.formGroup.valueChanges
      .pipe(debounceTime(200), takeUntil(this.destroy$))
      .subscribe(() => {
        this.valuesHasChanged = this.isFormValuesChanged();
      });
  }

  // ─── Validators ───────────────────────────────────────────────────────────────

  private minLengthArray(min: number): ValidatorFn {
    return (control: AbstractControl) => {
      if (control.value && control.value.length >= min) return null;
      return { minLengthArray: { valid: false, requiredLength: min, actualLength: control.value.length } };
    };
  }

  private sumLoanAmountsValidator(control: AbstractControl): ValidationErrors | null {
    const fg = control as FormGroup;
    const total =
      (Number(fg.get('typeAloanAmount')?.value) || 0) +
      (Number(fg.get('typeBloanAmount')?.value) || 0) +
      (Number(fg.get('additionalCredit')?.value) || 0);
    const max = Number(this.data?.loanData?.loanAmount);
    return !isNaN(max) && total > max ? { sumExceedsLoanAmount: true } : null;
  }

  private sumCreditAmountsValidator(control: AbstractControl): ValidationErrors | null {
    const fg = control as FormGroup;
    const total =
      (Number(fg.get('subsidizedCreditAmount')?.value) || 0) +
      (Number(fg.get('bonusCreditAmount')?.value) || 0) +
      (Number(fg.get('suportedCreditAmount')?.value) || 0) +
      (Number(fg.get('additionalCredit')?.value) || 0);
    const max = Number(this.data?.loanData?.loanAmount);
    return !isNaN(max) && total > max ? { sumExceedsLoanAmount: true } : null;
  }

  private applicationFeesValidator(control: AbstractControl): ValidationErrors | null {
    const parse = (val: any): number => {
      if (val === null || val === undefined) return 0;
      return parseFloat(String(val).replace(',', '.').replace(/[^\d.-]/g, '')) || 0;
    };

    const sum =
      parse(control.get('claimedAmountOfPurchase')?.value) +
      parse(control.get('claimedAmountOfBuildDevelopment')?.value) +
      parse(control.get('requestedNotaryFee')?.value);

    return sum * 0.001 < parse(control.get('applicationFee')?.value)
      ? { feeExcess: true }
      : null;
  }

  private repurchasedCreditNumberValidator(): ValidatorFn {
    return (group: AbstractControl): ValidationErrors | null => {
      if (!this.loanObject?.includes('AQS_RCH')) return null;

      const value = (group.get('repurchasedCreditNumber')?.value ?? '').toString().trim();
      if (!value) return { repurchasedCreditNumberRequired: true };

      const debts = this.dossierStore.get()?.debts ?? [];
      const found = debts.some((d: any) =>
        (d?.fileNumber ?? '').toString().trim() === value &&
        (d?.establishmentCode ?? '').toString().trim() === '022' &&
        (d?.codeProductFamily ?? '').toString().trim().toUpperCase() === 'PPO-PPC'
      );

      return found ? null : { repurchasedCreditNotFound: true };
    };
  }

  lessThanEqualToFixValue(max: number): ValidatorFn {
    return (): ValidationErrors | null => {
      const loanAmount = this.claimedAmountOfPurchaseFormControl?.value;
      return !loanAmount || loanAmount <= max ? null : { lessThanEqualToFixedValue: true };
    };
  }

  // ─── Conditional Validator Inits ─────────────────────────────────────────────

  initCappedRateValidators(): void {
    this.formGroup.get('loanData.rateType.code')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(value => {
        if (value === this.rateTypes.CAPE) {
          this.cappedRateFormControl?.addValidators([
            Validators.required,
            NumberValidators.greaterThanEqualTo({ fieldName: 'rate' }),
          ]);
        } else {
          this.cappedRateFormControl?.removeValidators([
            Validators.required,
            NumberValidators.greaterThanEqualTo({ fieldName: 'rate' }),
          ]);
          this.cappedRateFormControl?.reset();
        }
        this.cappedRateFormControl?.updateValueAndValidity();
      });
  }

  initClaimedAmountOfPurchaseValidators(): void {
    this.claimedAmountOfPurchaseFormControl.clearValidators();

    if (this.isYassir) {
      this.claimedAmountOfPurchaseFormControl.addValidators([
        Validators.required,
        this.lessThanEqualToFixValue(30000),
      ]);
    }

    if (this.loanObject.includes('AQS') && this.isYassir) {
      this.claimedAmountOfPurchaseFormControl.addValidators([
        NumberValidators.lessThanEqualTo({
          value: NumberUtils.toForcedNumber(this.acquisitionFee) + NumberUtils.toForcedNumber(this.acquisitionPrice),
        }),
      ]);
    }

    this.claimedAmountOfPurchaseFormControl.updateValueAndValidity();
  }

  private initAcquisitionPriceValidator(): void {
    this.acquisitionPriceFormControl?.clearValidators();
    this.acquisitionPriceFormControl?.addValidators([
      Validators.required,
      NumberValidators.sumPercentLessThanEqualTo({ fieldNameCoefficient: 0.08, fieldName: 'requestedNotaryFee' }),
    ]);
    this.acquisitionPriceFormControl?.updateValueAndValidity();
  }

  private initDelayedType(): void {
    this.delayTypes$?.subscribe();
  }

  private initDelayed(): void {
    this.getControlValueChanges(this.delayedFormControl)
      .pipe(takeUntil(this.destroy$))
      .subscribe(value => {
        const isPPRProduct = this.isImtilakPPR || this.isAdlSakanePPR || this.isSalafBaytiSantePPR;
        if (value === true && !isPPRProduct) {
          this.delayTypeFormControl.addValidators(Validators.required);
          this.delayDurationFormControl.addValidators(Validators.required);
        } else {
          this.delayTypeFormControl.removeValidators(Validators.required);
          this.delayTypeFormControl.reset();
          this.delayDurationFormControl.removeValidators(Validators.required);
          this.delayDurationFormControl.reset();
        }
        this.delayTypeFormControl.updateValueAndValidity();
        this.delayDurationFormControl.updateValueAndValidity();
      });
  }

  private initDurationListeners(): void {
    if (!this.isImtilak && !this.isImtilakPPR) return;

    const toYears = (ctrl: FormControl) =>
      ctrl.valueChanges.pipe(
        startWith(ctrl.value),
        map(v => NumberUtils.toForcedNumber(v) / 12),
        distinctUntilChanged(),
      );

    combineLatest([
      toYears(this.subsidizedCreditDurationFormControl),
      toYears(this.additionalloanDurationFormControl),
      toYears(this.suportedCreditDurationFormControl),
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([subYears, addYears, supYears]) => {
        const subRate = this.getDefaultRate('subventionné', subYears);
        const addRate = this.getDefaultRate('complémentaire', addYears);
        const supRate = this.getDefaultRate('soutenu', supYears);

        if (subRate !== null) this.setControlNumberValue(this.subsidizedCreditRateFormControl, subRate);
        if (addRate !== null) this.setControlNumberValue(this.additionalCreditRateFormControl, addRate);
        if (supRate !== null) this.setControlNumberValue(this.suportedCreditRateFormControl, supRate);
      });
  }

  // ─── Insurance Coefficient Calculations ──────────────────────────────────────

  private computeInsuranceCoefficient(promotionalRate: any, amount: number): string | null {
    if (this.isYassir || this.isPpoPpc) {
      return this.decimalPipe.transform(0.8, '1.4-4');
    }

    amount = NumberUtils.toForcedNumber(amount);
    if (amount <= 0) return null;

    promotionalRate = NumberUtils.toForcedNumber(promotionalRate);
    let rate = 0;

    if (promotionalRate > 0) {
      rate = promotionalRate / 12;
      const str = rate.toString();
      const dot = str.indexOf('.');
      if (dot !== -1) rate = Number(str.substring(0, dot + 4));
    } else {
      rate = amount >= 600000 ? 0.035 : 0.04;
    }

    return this.decimalPipe.transform(Number(rate * 1.1 * 12), '1.4-4');
  }

  calculateInsuranceCoefficient(): void {
    if (this.isYassir || this.isPpoPpc) {
      this.insuranceCoefficientFormControl?.setValue(0.8);
      return; // ← FIX: return manquant dans l'original (écrasait la valeur avec null potentiellement)
    }
    const coefficient = this.computeInsuranceCoefficient(
      this.promotionalInsuranceRateFormControl?.value,
      this.data.loanData?.loanAmount,
    );
    this.insuranceCoefficientFormControl?.setValue(coefficient);
  }

  calculateSubsidizedInsuranceCoefficient(): void {
    this.subsidizedInsuranceCoefficientFormControl?.setValue(
      this.computeInsuranceCoefficient(
        this.subsidizedPromotionalInsuranceRateFormControl?.value,
        this.data.loanData?.subsidizedCreditAmount,
      )
    );
  }

  calculateBonusInsuranceCoefficient(): void {
    this.bonusInsuranceCoefficientFormControl?.setValue(
      this.computeInsuranceCoefficient(
        this.bonusPromotionalInsuranceRateFormControl?.value,
        this.data.loanData?.bonusCreditAmount,
      )
    );
  }

  calculateSuportedInsuranceCoefficient(): void {
    this.suportedInsuranceCoefficientFormControl?.setValue(
      this.computeInsuranceCoefficient(
        this.suportedPromotionalInsuranceRateFormControl?.value,
        this.data.loanData?.suportedCreditAmount,
      )
    );
  }

  calculateTypeAInsuranceCoefficient(): void {
    this.typeAInsuranceCoefficientFormControl?.setValue(
      this.computeInsuranceCoefficient(
        this.typeAPromotionalInsuranceRateFormControl?.value,
        this.data.loanData?.typeAloanAmount,
      )
    );
  }

  calculateTypeBInsuranceCoefficient(): void {
    this.typeBInsuranceCoefficientFormControl?.setValue(
      this.computeInsuranceCoefficient(
        this.typeBPromotionalInsuranceRateFormControl?.value,
        this.data.loanData?.typeBloanAmount,
      )
    );
  }

  calculateAdditionalInsuranceCoefficient(): void {
    this.aditionalCreditInsuranceCoefficientFormControl?.setValue(
      this.computeInsuranceCoefficient(
        this.aditionalCreditPromotionalInsuranceRateFormControl?.value,
        this.data.loanData?.additionalCredit,
      )
    );
  }

  // ─── Stepper Navigation ───────────────────────────────────────────────────────

  nextStep = (): void => {
    this.principalStepper.next();
    this.changeDetectorRef.detectChanges();
  };

  previousStepper = (): void => {
    this.principalStepper.previous();
  };

  doneStepper = (): void => {
    this.onValidate();
  };

  onSelectionChange(event: any): void {
    if (event.selectedIndex === 4 && this.isFormValuesChanged()) {
      this.dossierStore.update({ propertyData: this.propertyDataFormGroup.getRawValue() });
    }

    if (event.selectedIndex === 5 && this.isFormValuesChanged()) {
      const dossierData = this.dossierStore.get();
      const dossier: DossierData = {
        ...dossierData,
        loanData: { ...dossierData.loanData, loanAmount: this.calculateLoanAmount() },
        beneficiaries: this.beneficiariesFormArray.getRawValue(),
        propertyData: this.propertyDataFormGroup.getRawValue(),
        guarantors: this.guarantorsFormArray.getRawValue(),
        warranties: this.warranties,
      };

      this.dossierDataService.generateAutoWarranties({ ...dossier })
        .pipe(takeUntil(this.destroy$))
        .subscribe(warranties => {
          this.warranties = [...warranties];
          this.changeDetectorRef.detectChanges();
        });
    }
  }

  // ─── Validation & Submit ─────────────────────────────────────────────────────

  onValidate(): void {
    if (!this.formGroup.valid) {
      // FIX: dans l'original, le else du second if rattrapait aussi le cas form invalid → double message.
      // Désormais : form invalide → message erreur champs, form valide sans changement → message "aucun changement".
      this.showErrorMessage({ bodyKey: 'Veuillez vérifier les champs du formulaire !' });
      return;
    }

    if (this.isFormValuesChanged()) {
      const emitData = {
        ...this.formGroup.getRawValue(),
        warranties: this.warranties
          .filter(({ type }) => type !== WarrantyType.AUTO)
          .map(({ content }) => ({ content, type: WarrantyType.PROPOSED })),
      };
      this.returnToDecision.emit(emitData);
      this.dossierStore.update({ propertyData: this.oldPropertyData });
      this.changeDetectorRef.detectChanges();
    } else {
      const errors: any[] = [];
      this.calculateFormValidationErrors(this.formGroup, errors);
      const errorMessage =
        errors.length === 0
          ? "Aucun changement n'a été effectué !"
          : errors
              .filter(({ errorName }) => errorName !== 'required')
              .map(({ controlName }) => controlName)
              .join('\n');

      this.showErrorMessage({ bodyKey: errorMessage });
    }
  }

  isFormValuesChanged(): boolean {
    const { loanData, insuranceData, propertyData, beneficiaries, guarantors, representatives, notary, warranties } =
      this.data;

    const formValue = this.formGroup.value;

    const newFormObject: any = {
      loanData: formValue.loanData,
      propertyData: formValue.propertyData,
      beneficiaries: formValue.beneficiaries ?? [],
      guarantors: formValue.guarantors ?? [],
      representatives: formValue.representatives ?? [],
      notary: formValue.notary ?? {},
      warranties: this.warranties ?? [],
      insuranceData: {
        ...formValue.insuranceData,
        insuranceCoefficient: NumberUtils.toForcedNumber(
          this.isYassir || this.isPpoPpc ? 0.8 : formValue.insuranceData?.insuranceCoefficient
        ),
        subsidizedInsuranceCoefficient: NumberUtils.toForcedNumber(formValue.insuranceData?.subsidizedInsuranceCoefficient),
        bonusInsuranceCoefficient: NumberUtils.toForcedNumber(formValue.insuranceData?.bonusInsuranceCoefficient),
        suportedInsuranceCoefficient: NumberUtils.toForcedNumber(formValue.insuranceData?.suportedInsuranceCoefficient),
        typeAInsuranceCoefficient: NumberUtils.toForcedNumber(formValue.insuranceData?.typeAInsuranceCoefficient),
        typeBInsuranceCoefficient: NumberUtils.toForcedNumber(formValue.insuranceData?.typeBInsuranceCoefficient),
        aditionalCreditInsuranceCoefficient: NumberUtils.toForcedNumber(formValue.insuranceData?.aditionalCreditInsuranceCoefficient),
      },
    };

    const initialObject = { loanData, insuranceData, propertyData, beneficiaries, guarantors, representatives, notary: notary ?? {}, warranties };
    const cleanedCurrent = ObjectUtils.mergeFormWithInitial(initialObject, newFormObject);
    const modifications = ObjectUtils.diffObjects(initialObject, cleanedCurrent);

    console.log('Deltas réels:', { modifications, initialObject, cleanedCurrent });
    return Object.keys(modifications).length > 0;
  }

  // ─── Warranties ───────────────────────────────────────────────────────────────

  addWarranty(event: MatChipInputEvent): void {
    const value = (event.value ?? '').trim();
    if (value) {
      this.warranties.push({ content: value });
      this.warrantiesSubject.next(this.warranties);
    }
    event.chipInput!.clear();
  }

  removeWarranty(index: number, isAuto: boolean): void {
    if (index >= 0 && !isAuto) {
      this.warranties.splice(index, 1);
      this.warrantiesSubject.next(this.warranties);
    }
  }

  // ─── Calculations ─────────────────────────────────────────────────────────────

  calculateLoanAmount(): number {
    const lg = this.loanDataFormGroup;
    const result =
      NumberUtils.toForcedNumber(lg.get('claimedAmountOfBuildDevelopment')?.value ?? 0) +
      NumberUtils.toForcedNumber(lg.get('claimedAmountOfPurchase')?.value ?? 0) +
      NumberUtils.toForcedNumber(lg.get('requestedNotaryFee')?.value ?? 0);
    return parseFloat(result.toFixed(2));
  }

  calculateApplicationFee(): void {
    const lg = this.loanDataFormGroup;
    let sum = 0;

    if (!this.isPpoPpc) {
      sum +=
        NumberUtils.toForcedNumber(lg.get('claimedAmountOfPurchase')?.value ?? 0) +
        NumberUtils.toForcedNumber(lg.get('claimedAmountOfBuildDevelopment')?.value ?? 0) +
        NumberUtils.toForcedNumber(lg.get('requestedNotaryFee')?.value ?? 0);
    }

    this.applicationFeeFormControl?.patchValue(NumberUtils.round(sum / 1000, 2));
  }

  // ─── Misc / Helpers ───────────────────────────────────────────────────────────

  compareObjects(o1: any, o2: any): boolean {
    return o1?.code === o2?.code;
  }

  update = (): void => {
    const dossier = this.dossierStore.get();
    this.dossierStore.update({ ...dossier, ...this.formGroupRawValue });
  };

  updatePropertyData(dossierPayload: any, savedDossier: any): void {
    const propertyData = dossierPayload.propertyData;
    const newPropertyData: PropertyData = {
      ...propertyData,
      properties: savedDossier?.propertyData?.properties ?? propertyData?.properties,
      coFinancing: savedDossier?.propertyData?.coFinancing ?? propertyData?.coFinancing,
    };
    this.dossierStore.update({ propertyData: newPropertyData }, false);
  }

  updateNotaryValidations(): void {
    if (!this.formGroup || !this.notaryFormGroup) return;
    if (this.fieldsClearingCondition('Notary')) {
      this.clearNotaryFieldValidators();
    }
    this.notaryMailFormControl?.updateValueAndValidity();
    this.notaryPhoneFormControl?.updateValueAndValidity();
    this.notaryFormGroup.get('name')?.updateValueAndValidity();
    this.notaryFormGroup.get('address')?.updateValueAndValidity();
  }

  private clearNotaryFieldValidators(): void {
    this.notaryMailFormControl.clearValidators();
    this.notaryMailFormControl.addValidators([Validators.email]);
    this.notaryPhoneFormControl.clearValidators();
    this.notaryPhoneFormControl.addValidators([Validators.pattern('^(0[0-9]{9}|\\+?[1-9]\\d{1,14})$')]);
    this.notaryFormGroup.get('name')?.clearValidators();
    this.notaryFormGroup.get('address')?.clearValidators();
  }

  private fieldsClearingCondition(field: 'Notary'): boolean {
    const dossier = this.dossierStore.get();
    this.accord = dossier?.accord;
    this.isProspect = !!dossier?.customerData?.personalInfo?.prospect;
    const product = dossier.product?.code;

    const allowedCodesByField: Record<typeof field, string[]> = {
      Notary: [
        Products.MOULKIA.toString(),
        Products.PPI_VEFA.toString(),
        Products.YASSIR.toString(),
        Products.YASSIR_PPR.toString(),
        Products.PPO.toString(),
        Products.PPO_PPR.toString(),
        Products.PPC.toString(),
      ],
    };

    return this.accord === AccordType.PRINCIPE || this.isProspect || allowedCodesByField[field].includes(product!);
  }

  private getDefaultRate(type: 'subventionné' | 'complémentaire' | 'soutenu', years: number): number | null {
    const rates: Record<typeof type, [number, number][]> = {
      'subventionné':    [[7, 2.20], [15, 2.50], [25, 2.75]],
      'complémentaire':  [[7, 4.20], [15, 4.50], [25, 4.75]],
      'soutenu':         [[7, 4.20], [15, 4.50], [25, 4.75]],
    };
    const entry = rates[type].find(([limit]) => years <= limit);
    return entry ? entry[1] : null;
  }

  // ─── Product Helpers ──────────────────────────────────────────────────────────

  /** Produits subventionnés : Imtilak, ADL Sakane, Salaf Bayti Sante (avec ou sans PPR). */
  private isSubventionedProduct(): boolean {
    return this.isSelectedProductIn([
      Products.ADL_SAKANE, Products.ADL_SAKANE_PPR,
      Products.IMTILAK, Products.IMTILAK_PPR,
      Products.SALAF_BAYTI_SANTE, Products.SALAF_BAYTI_SANTE_PPR,
    ]);
  }

  public isSelectedProduct(productCode: string): boolean {
    return this.selectedProduct?.code === productCode;
  }

  public isSelectedProductIn(productsCodes: string[]): boolean {
    return productsCodes.includes(this.selectedProduct?.code);
  }

  public isYasserProduct(): boolean {
    return this.isSelectedProductIn([Products.YASSIR, Products.YASSIR_PPR]);
  }

  public isPpoPpcProduct(): boolean {
    return this.isSelectedProductIn([Products.PPO, Products.PPO_PPR, Products.PPC]);
  }

  public isItABuildingLotAcquisition(): boolean {
    return this.loanObject === 'AQS' && this.propertyType === 'TRN';
  }

  public isAnyMechanismOrType(): boolean {
    return this.isTypeA() || this.isTypeB() || this.isMechanism1() || this.isMechanism2();
  }

  public isMechanism1(): boolean { return this.isMechanismExists(this.selectedMechanism, MechanismType.MECHANISM_1); }
  public isMechanism2(): boolean { return this.isMechanismExists(this.selectedMechanism, MechanismType.MECHANISM_2); }
  public isMechanism3(): boolean { return this.isMechanismExists(this.selectedMechanism, MechanismType.MECHANISM_3); }
  public isTypeA(): boolean { return this.isMechanismExists(this.selectedMechanism, MechanismType.TYPE_A); }
  public isTypeB(): boolean { return this.isMechanismExists(this.selectedMechanism, MechanismType.TYPE_B); }

  private isMechanismExists(arrayValues: Mechanism | Mechanism[], value: string): boolean {
    if (!Array.isArray(arrayValues)) arrayValues = [arrayValues];
    return !!arrayValues.find(m => m?.code === value);
  }

  // ─── Getters ──────────────────────────────────────────────────────────────────

  get formGroupRawValue(): any { return this.formGroup.getRawValue(); }

  get loanDataFormGroup(): FormGroup { return this.formGroup.get('loanData') as FormGroup; }
  get propertyDataFormGroup(): FormGroup { return this.formGroup.get('propertyData') as FormGroup; }
  get notaryFormGroup(): FormGroup { return this.formGroup.get('notary') as FormGroup; }

  get beneficiariesFormArray(): FormArray { return this.formGroup.controls['beneficiaries'] as FormArray; }
  get guarantorsFormArray(): FormArray { return this.formGroup.controls['guarantors'] as FormArray; }
  get representativesFormArray(): FormArray { return this.formGroup.controls['representatives'] as FormArray; }
  get warrantiesFormArray(): FormArray { return this.formGroup.controls['warranties'] as FormArray; }

  get rateFormControl(): FormControl { return this.formGroup.get('loanData.rate') as FormControl; }
  get cappedRateFormControl(): FormControl { return this.formGroup.get('loanData.cappedRate') as FormControl; }
  get delayedFormControl(): FormControl { return this.loanDataFormGroup.get('delayed') as FormControl; }
  get delayTypeFormControl(): FormControl { return this.formGroup.get('loanData.delayType') as FormControl; }
  get delayDurationFormControl(): FormControl { return this.loanDataFormGroup.get('delayDuration') as FormControl; }
  get deadlineNumberFormControl(): FormControl { return this.loanDataFormGroup.get('deadlineNumber') as FormControl; }
  get rateTypeCodeFormControl(): FormControl { return this.formGroup.get('loanData.rateType.code') as FormControl; }
  get applicationFeeFormControl(): FormControl { return this.loanDataFormGroup.get('applicationFee') as FormControl; }
  get acquisitionPriceFormControl(): AbstractControl | null { return this.loanDataFormGroup?.get('acquisitionPrice'); }
  get claimedAmountOfPurchaseFormControl(): FormControl { return this.loanDataFormGroup.get('claimedAmountOfPurchase') as FormControl; }

  get delayed(): any { return this.formGroup?.get('loanData.delayed')?.value; }
  get delayType(): any { return this.formGroup?.get('loanData.delayType')?.value; }
  get delayDuration(): any { return this.formGroup?.get('loanData.delayDuration')?.value; }

  // Insurance
  get insuranceCoefficientFormControl(): FormControl { return this.formGroup.get('insuranceData.insuranceCoefficient') as FormControl; }
  get promotionalInsuranceRateFormControl(): FormControl { return this.formGroup.get('insuranceData.promotionalInsuranceRate') as FormControl; }

  get subsidizedInsuranceCoefficientFormControl(): FormControl { return this.formGroup.get('insuranceData.subsidizedInsuranceCoefficient') as FormControl; }
  get subsidizedPromotionalInsuranceRateFormControl(): FormControl { return this.formGroup.get('insuranceData.subsidizedPromotionalInsuranceRate') as FormControl; }
  get subsidizedInsuredPercentageFormControl(): FormControl { return this.formGroup.get('insuranceData.subsidizedInsuredPercentage') as FormControl; }
  get subsidizedCreditDurationFormControl(): FormControl { return this.loanDataFormGroup.get('subsidizedCreditDuration') as FormControl; }
  get subsidizedCreditRateFormControl(): FormControl { return this.loanDataFormGroup.get('subsidizedCreditRate') as FormControl; }

  get bonusInsuranceCoefficientFormControl(): FormControl { return this.formGroup.get('insuranceData.bonusInsuranceCoefficient') as FormControl; }
  get bonusPromotionalInsuranceRateFormControl(): FormControl { return this.formGroup.get('insuranceData.bonusPromotionalInsuranceRate') as FormControl; }
  get bonusInsuredPercentageFormControl(): FormControl { return this.formGroup.get('insuranceData.bonusInsuredPercentage') as FormControl; }
  get bonusCreditDurationFormControl(): FormControl { return this.loanDataFormGroup.get('bonusCreditDuration') as FormControl; }
  get bonusCreditRateFormControl(): FormControl { return this.loanDataFormGroup.get('bonusCreditRate') as FormControl; }

  get suportedInsuranceCoefficientFormControl(): FormControl { return this.formGroup.get('insuranceData.suportedInsuranceCoefficient') as FormControl; }
  get suportedPromotionalInsuranceRateFormControl(): FormControl { return this.formGroup.get('insuranceData.suportedPromotionalInsuranceRate') as FormControl; }
  get suportedInsuredPercentageFormControl(): FormControl { return this.formGroup.get('insuranceData.suportedInsuredPercentage') as FormControl; }
  get suportedCreditDurationFormControl(): FormControl { return this.loanDataFormGroup.get('suportedCreditDuration') as FormControl; }
  get suportedCreditRateFormControl(): FormControl { return this.loanDataFormGroup.get('suportedCreditRate') as FormControl; }

  get typeAInsuranceCoefficientFormControl(): FormControl { return this.formGroup.get('insuranceData.typeAInsuranceCoefficient') as FormControl; }
  get typeAPromotionalInsuranceRateFormControl(): FormControl { return this.formGroup.get('insuranceData.typeAPromotionalInsuranceRate') as FormControl; }
  get typeAInsuredPercentageFormControl(): FormControl { return this.formGroup.get('insuranceData.typeAInsuredPercentage') as FormControl; }

  get typeBInsuranceCoefficientFormControl(): FormControl { return this.formGroup.get('insuranceData.typeBInsuranceCoefficient') as FormControl; }
  get typeBPromotionalInsuranceRateFormControl(): FormControl { return this.formGroup.get('insuranceData.typeBPromotionalInsuranceRate') as FormControl; }
  get typeBInsuredPercentageFormControl(): FormControl { return this.formGroup.get('insuranceData.typeBInsuredPercentage') as FormControl; }

  get aditionalCreditInsuranceCoefficientFormControl(): FormControl { return this.formGroup.get('insuranceData.aditionalCreditInsuranceCoefficient') as FormControl; }
  get aditionalCreditPromotionalInsuranceRateFormControl(): FormControl { return this.formGroup.get('insuranceData.aditionalCreditPromotionalInsuranceRate') as FormControl; }
  get aditionalCreditInsuredPercentageFormControl(): FormControl { return this.formGroup.get('insuranceData.aditionalCreditInsuredPercentage') as FormControl; }

  get additionalloanDurationFormControl(): FormControl { return this.loanDataFormGroup.get('additionalLoanDuration') as FormControl; }
  get additionalCreditRateFormControl(): FormControl { return this.loanDataFormGroup.get('additionalCreditRate') as FormControl; }

  get notaryPhoneFormControl(): FormControl { return this.notaryFormGroup?.get('phone') as FormControl; }
  get notaryMailFormControl(): FormControl { return this.notaryFormGroup?.get('email') as FormControl; }
}
