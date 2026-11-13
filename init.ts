import { CdkStepper } from '@angular/cdk/stepper';
import { AfterViewInit, Component, EventEmitter, Injector, Input, OnInit, Output, ViewChild } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  Validators,
  ValidatorFn,
  FormArray,
  ValidationErrors
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
  Restriction,
  RestrictionType,
  Warranty,
  WarrantyType,
} from '@core/models';
import { BehaviorSubject, combineLatest, merge, Observable, Subject} from 'rxjs';
import { distinctUntilChanged, map, skip, startWith, takeUntil, tap } from 'rxjs/operators';
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
import { DossierValidators } from '@loan-dossier/config/dossier-validators';
import { LoanDataCalculationService } from '@loan-dossier/services/loan-calculation.service';

@Component({
  selector: 'app-back-decsion-stepper',
  templateUrl: './back-decsion-stepper.component.html',
  styleUrls: ['./back-decsion-stepper.component.scss'],
  providers:[LoanDataCalculationService]
})
export class BackToDecisionStepperComponent extends BaseComponent implements OnInit, AfterViewInit {

  @Input() data: any = {};
  @Output() returnToDecision = new EventEmitter<any>();
  @Output() goBack = new EventEmitter<any>();
  @ViewChild('principalStepper') principalStepper!: CdkStepper;

  dossierData!: DossierData;
  oldPropertyData: any;
  loanObject!: string;
  propertyType!: string;
  periodicity!: string;
  isProspect: boolean = false;
  valuesHasChanged: boolean = false;
  stepsVisited: boolean[] = [true, ...new Array(6).fill(false)];

  formGroup!: FormGroup;
  propertyDataNotaryFormGroup!: FormGroup;
  rateTypeFilterControl = new FormControl();
  delayTypeFilterControl = new FormControl();

  selectedProduct!: CodeLabel;
  selectedMechanism: CodeLabel[] = [];

  isImtilak!: boolean;
  isImtilakPPR!: boolean;
  isSalafBaytiSante!: boolean;
  isSalafBaytiSantePPR!: boolean;

  isAdlSakane!: boolean;
  isAdlSakanePPR!: boolean;
  isFogarim!: boolean;
  isFogaloge!: boolean;
  isClipriMRE!: boolean;
  isPpiMRE!: boolean;
  isVeFa!: boolean;
  isPpoPpcFamily!: boolean;
  isYassir!: boolean;
  isPpoPpc!: boolean;
  isPPIProduct!: boolean;
  isCtb = false;

  acquisitionPrice!: number;
  acquisitionFee!: number;
  requestedNotaryFee!: number;
  claimedAmountOfPurchase!: number;
  claimedAmountOfBuildDevelopment!: number;
  buildDevelopmentQuotation!: number;

  maxDeadline!: number;
  maxDeadlineValues: Map<string, number> = new Map([
    ['MONTHLY', 120],
    ['ANNUAL', 10],
    ['BIMONTHLY', 240],
    ['QUARTERLY', 40]
  ]);

  warranties: Warranty[] = [];
  restrictions: Restriction [] = [];
  addOnBlur = true;
  removableWarranty = true;
  selectableWarranty = true;
  selectableRestriction = true;
  readonly separatorKeysCodes = [ENTER, COMMA] as const;
  private warrantiesSubject: BehaviorSubject<Warranty[]> = new BehaviorSubject<Warranty[]>([]);
  private restrictionsSubject: BehaviorSubject<Restriction[]> = new BehaviorSubject<Restriction[]>([]);
  removableRestriction = true;
  public readonly RestrictionType = RestrictionType;

  rateTypes = RateTypes;
  dossierData$!: Observable<DossierData>;
  rateTypes$!: Observable<CodeLabel[]>;
  cities$?: Observable<RefCity[]>;
  delayTypes$?: Observable<DelayType[]>;
  filteredRateTypes$?: Observable<RateType[]>;
  filteredDelayTypes$?: Observable<DelayType[]>;

  insuranceCoefficient$: BehaviorSubject<number> = new BehaviorSubject<number>(0);
  aditionalCreditnsuranceCoefficient$: BehaviorSubject<number> = new BehaviorSubject<number>(0);
  private destroy$ = new Subject<void>();
  dossierAccordPrincipe: boolean | undefined;
  notaryFeeRule: any = { isEligible: false, coefficient: 0 };

  constructor(
    private dossierStore: DossierDataStoreService,
    public dossierDataService: DossierDataService,
    public topVipService: TopVipService,
    public refService: ReferentialService,
    public selectService:SelectSearchService,
    public dialogMessageService: DialogMessageService,
    userService: UserService,

    private loanCalculationService: LoanDataCalculationService,
    injector: Injector
  ) {

    super(injector);
    this.isCtb = userService.hasRole([Role.CTB]);
    this.oldPropertyData = this.dossierStore.get()?.propertyData;
    this.cities$ = this.refService.getCities();
    this.delayTypes$ = this.refService.mapToCodeDesignation(this.refService.getAllDelayTypes());
  }


  ngOnInit(): void {
    this.refService.getAllPropertyTypes();

    const dossier = this.dossierStore.get();
    const personalInfo = this.data.customerData?.personalInfo;
    this.isProspect = !!dossier?.customerData?.personalInfo?.prospect;

    this.loanObject = this.data.loanData.loanObject.code;
    this.acquisitionFee= this.data.loanData.acquisitionFee;
    this.acquisitionPrice= this.data.loanData.acquisitionPrice;
    this.buildDevelopmentQuotation= this.data.loanData.buildDevelopmentQuotation;
    this.propertyType=this.data.loanData?.propertyType?.code;
    this.periodicity=this.data.loanData?.periodicity?.code;
    this.warranties = [...this.data.warranties];
    this.restrictions = [...(this.data.restrictions ?? [])];
    this.maxDeadline= this.maxDeadlineValues.get(this.periodicity) || 0;
    this.rateTypes$ = this.refService.mapToCodeDesignation(this.refService.getAllRateTypes());
    this.selectedProduct= this.data.product;
    this.selectedMechanism=this.data.loanData?.mechanisms!;
    this.isClipriMRE = ['MCH/01', 'MCH/01PRI','MCH/09PRI'].includes(personalInfo?.market);
    this.dossierAccordPrincipe = this.data?.accord === AccordType.PRINCIPE;

    // Product selection flags
    this.isPpiMRE=this.isSelectedProduct(Products.PPI_MRE);
    this.isVeFa=this.isSelectedProduct(Products.PPI_VEFA_RESIDENT);
    this.isFogarim = this.isSelectedProduct(Products.FOGARIM);
    this.isFogaloge = this.isSelectedProduct(Products.FOGALOGE);
    this.isPPIProduct=this.isSelectedProductIn([Products.PPI_CLASSIQUE,Products.PPI_PPR_FONC]);
    this.isImtilak = this.isSelectedProduct(Products.IMTILAK);
    this.isImtilakPPR = this.isSelectedProduct(Products.IMTILAK_PPR);
    this.isAdlSakane = this.isSelectedProduct(Products.ADL_SAKANE);
    this.isAdlSakanePPR = this.isSelectedProduct(Products.ADL_SAKANE_PPR);
    this.isSalafBaytiSante = this.isSelectedProduct(Products.SALAF_BAYTI_SANTE);
    this.isSalafBaytiSantePPR = this.isSelectedProduct(Products.SALAF_BAYTI_SANTE_PPR);
    this.isYassir=this.isSelectedProductIn([Products.YASSIR,Products.YASSIR_PPR]);
    this.isPpoPpc = this.isSelectedProductIn([Products.PPO,Products.PPO_PPR,Products.PPC]);
    this.isPpoPpcFamily = this.isSelectedProductIn([ Products.PPO, Products.PPC, Products.PPO_PPR, Products.YASSIR, Products.YASSIR_PPR,
          Products.PRET_ETU_BANK_IN, Products.PRET_ENS_PLUS, Products.PRET_ETU_MAST_BANK, Products.CREDIT_ORDI_BANK]);

    this.initFormGroup();
    this.initDelayedType();
    this.initDelayed();
    this.updateNotaryValidations();
    this.setupLoanCalculationListeners();
    this.initClaimedAmountOfPurchaseValidators();

    this.insuranceCoefficient$.subscribe((value) => this.insuranceCoefficientFormControl?.setValue(value));
    

    if (!this.isSelectedProductIn([Products.ADL_SAKANE,Products.ADL_SAKANE_PPR,Products.IMTILAK,Products.IMTILAK_PPR,Products.SALAF_BAYTI_SANTE,Products.SALAF_BAYTI_SANTE_PPR]) ){
      this.initCappedRateValidators();
      this.initCoefficientWithFallback(this.data?.insuranceData?.insuranceCoefficient, this.insuranceCoefficientFormControl, () => this.calculateInsuranceCoefficient());
    }

    if (this.isMechanism1()) {
        this.initCoefficientWithFallback(this.data?.insuranceData?.subsidizedInsuranceCoefficient, this.subsidizedInsuranceCoefficientFormControl, () => this.calculateSubsidizedInsuranceCoefficient());
    }
    if (this.isMechanism2()) {
        this.initCoefficientWithFallback(this.data?.insuranceData?.bonusInsuranceCoefficient, this.bonusInsuranceCoefficientFormControl, () => this.calculateBonusInsuranceCoefficient());
    }
    if (this.isMechanism3()) {
        this.initCoefficientWithFallback(this.data?.insuranceData?.suportedInsuranceCoefficient, this.suportedInsuranceCoefficientFormControl, () => this.calculateSuportedInsuranceCoefficient());
    }

    if (this.isTypeA()) {
        this.initCoefficientWithFallback(this.data?.insuranceData?.typeAInsuranceCoefficient, this.typeAInsuranceCoefficientFormControl, () => this.calculateTypeAInsuranceCoefficient());
    }
    if (this.isTypeB()) {
        this.initCoefficientWithFallback(this.data?.insuranceData?.typeBInsuranceCoefficient, this.typeBInsuranceCoefficientFormControl, () => this.calculateTypeBInsuranceCoefficient());
    }

    if (this.isTypeB() || this.isTypeA() ||this.isMechanism1() ||this.isMechanism2() ) {
      this.initCoefficientWithFallback(this.data?.insuranceData?.aditionalCreditInsuranceCoefficient, this.aditionalCreditInsuranceCoefficientFormControl, () => this.calculateAdditionalInsuranceCoefficient());
    }

    this.formGroup.get('insuranceData.promotionalInsuranceRate')?.valueChanges.subscribe(()=> {
      this.calculateInsuranceCoefficient();
    })

    this.formGroup.get('insuranceData.subsidizedPromotionalInsuranceRate')?.valueChanges.subscribe(()=> {
      this.calculateSubsidizedInsuranceCoefficient();
    })

    this.formGroup.get('insuranceData.bonusPromotionalInsuranceRate')?.valueChanges.subscribe(()=> {
      this.calculateBonusInsuranceCoefficient();
    })

    this.formGroup.get('insuranceData.suportedPromotionalInsuranceRate')?.valueChanges.subscribe(()=> {
      this.calculateSuportedInsuranceCoefficient();
    })

    this.formGroup.get('insuranceData.typeAPromotionalInsuranceRate')?.valueChanges.subscribe(()=> {
      this.calculateTypeAInsuranceCoefficient();

    })

    this.formGroup.get('insuranceData.typeBPromotionalInsuranceRate')?.valueChanges.subscribe(()=> {
      this.calculateTypeBInsuranceCoefficient();
    })


    this.formGroup.get('insuranceData.aditionalCreditPromotionalInsuranceRate')?.valueChanges.subscribe(()=> {
      this.calculateAdditionalInsuranceCoefficient();
    })

    this.formGroup.valueChanges.subscribe(() => {
      this.valuesHasChanged = this.isFormValuesChanged();
    });

    this.filteredRateTypes$= this.selectService.filterOptions(this.rateTypes$ || [],this.rateTypeFilterControl,'designation')
    this.filteredDelayTypes$= this.selectService.filterOptions(this.delayTypes$ || [],this.delayTypeFilterControl,'designation')

    if (!this.isImtilak && !this.isImtilakPPR && !this.isAdlSakane && !this.isAdlSakanePPR && !this.isSalafBaytiSante && !this.isSalafBaytiSantePPR)  {
      this.loanDataFormGroup.addControl("rate", new FormControl(null, [Validators.required]));
    }

    this.notaryFeeRule = this.notaryFeeRuleConfig(this.loanObject);
    this.applyRequestedNotaryFeeValidators(this.loanObject);
    this.initDurationListeners();
    this.calculateLoanAmountListener();
  }

  ngAfterViewInit(): void {
    this.dossierStore.update({propertyData: this.data?.propertyData});
    this.formGroup.patchValue(this.data);
  }

  private applyRequestedNotaryFeeValidators(loanObjectCode: string){
    const isAQS = loanObjectCode?.includes('AQS');

    if(!this.notaryFeeRule.isEligible) {
      const isAcquisitionPriceHidden = (this.isYassir || this.isPpoPpc) && !isAQS;
      this.acquisitionFeeFormControl?.reset(null, { emitEvent: true });
      this.requestedNotaryFeeFormControl?.reset(null, { emitEvent: true });
      this.acquisitionFeeFormControl?.clearValidators();
      this.requestedNotaryFeeFormControl?.clearValidators();
      this.acquisitionPriceFormControl?.clearValidators();
      if (!isAcquisitionPriceHidden) {
      this.acquisitionPriceFormControl?.addValidators([Validators.required]);
      }
      this.acquisitionPriceFormControl?.updateValueAndValidity();
      this.acquisitionFeeFormControl?.updateValueAndValidity();
      this.requestedNotaryFeeFormControl?.updateValueAndValidity();
      return;
    }

    this.requestedNotaryFeeFormControl?.addValidators([NumberValidators.lessThanEqualTo({ fieldName:  'acquisitionFee' })]);
    this.acquisitionPriceFormControl?.clearValidators();
    this.acquisitionPriceFormControl?.addValidators([
      Validators.required,  
      NumberValidators.sumPercentLessThanEqualTo({ fieldNameCoefficient: this.notaryFeeRule.coefficient, fieldName: 'requestedNotaryFee' })
    ]);
    this.acquisitionPriceFormControl?.updateValueAndValidity();
    this.requestedNotaryFeeFormControl?.updateValueAndValidity();
  }

 

  isAnyMechanismOrType(): boolean {
    return this.isTypeA() || this.isTypeB() || this.isMechanism1() || this.isMechanism2();
  }

  public isSelectedProductIn(productsCode: string[]) {
    return productsCode.includes(this.selectedProduct?.code) ;
  }

  nextStep = () => {
      this.principalStepper.next();
      this.changeDetectorRef.detectChanges();
  }

  doneStepper = () => {
    this.onValidate();
  };

  previousStepper = () => {
    if(this.principalStepper.selectedIndex === 0) this.goBack.emit();
    else this.principalStepper.previous();
  }

  onSelectionChange(event: any) {
    if(event.selectedIndex === 4 || event.selectedIndex ===6) {
      const dossierData = this.dossierStore.get();
      const dossier: DossierData = {
        ...dossierData,
        createdAt: dossierData.createdAt,
        loanData : {
          ...dossierData.loanData,
          loanAmount: this.calculateLoanAmount()
        },
        beneficiaries: this.beneficiariesFormArray.value,
        propertyData: this.propertyDataFormGroup.value,
        guarantors: this.guarantorsFormArray.value,
        warranties: this.warranties,
        restrictions: this.restrictions
      };
      this.dossierDataService.generateAutoWarranties({ ...dossier }).subscribe(warranties => {
        this.warranties = [...warranties];
        this.changeDetectorRef.detectChanges();
      });
    };
  }

  calculateLoanAmount(): number {
    const claimedAmountOfBuildDevelopment =  this.loanDataFormGroup.get('claimedAmountOfBuildDevelopment')?.value;
    const claimedAmountOfPurchase =  this.loanDataFormGroup.get('claimedAmountOfPurchase')?.value;
    const requestedNotaryFee =  this.loanDataFormGroup.get('requestedNotaryFee')?.value;

    const result =  NumberUtils.toForcedNumber(claimedAmountOfBuildDevelopment || 0) +
                    NumberUtils.toForcedNumber(claimedAmountOfPurchase || 0) +
                    NumberUtils.toForcedNumber(requestedNotaryFee || 0);

    return parseFloat(result.toFixed(2));
  }

  public isSelectedProduct(productCode: string) {
    return this.selectedProduct?.code === productCode;
  }

  initFormGroup() {
    const isOptional = this.isSelectedProductIn([Products.YASSIR, Products.YASSIR_PPR, Products.PPO, Products.PPC, Products.PPO_PPR]);

    this.formGroup = this.formBuilder.group({
      propertyData: this.formBuilder.group({
        properties: this.formBuilder.array([], isOptional ? [] : [DossierValidators.minLengthArray(1)]),
        coFinancing: new FormControl()
      }),
      notary: this.formBuilder.group({
        name: new FormControl(null, []),
        address: new FormControl(null, []),
        phone: new FormControl(null, [Validators.pattern('^(0[0-9]{9}|\\+?[1-9]\\d{1,14})$')]),
        email: new FormControl(null, [Validators.email])
      }),
      loanData: this.formBuilder.group({
        loanAmount: new FormControl(null, []),
        acquisitionPrice: new FormControl(null, []),
        buildDevelopmentQuotation: new FormControl(null, []),
        investmentAmount: new FormControl(null, []),
        acquisitionFee: new FormControl(null, []),
        requestedNotaryFee: new FormControl(null, []),
        repurchaseTypes: new FormControl(this.data?.loanData?.repurchaseTypes ?? null),
        repurchasedCreditNumber: new FormControl(this.data?.loanData?.repurchasedCreditNumber ?? null),
        rateType: this.formBuilder.group({
          code: new FormControl(null, [Validators.required]),
        }),
        cappedRate: new FormControl(null),
        delayed: new FormControl(false, ...(this.data?.loanData?.delayed ? [Validators.required] : [])),
        delayType: new FormControl(),
        delayDuration: new FormControl()
      }),
      insuranceData: this.formBuilder.group({}),
      beneficiaries: this.formBuilder.array([], isOptional ? [] : [DossierValidators.minLengthArray(1)]),
      guarantors: this.formBuilder.array([]),
      representatives: this.formBuilder.array([]),
      warranties: this.formBuilder.array([], [DossierValidators.minLengthArray(1)]),
    });


    if (!this.isSelectedProductIn([Products.ADL_SAKANE,Products.ADL_SAKANE_PPR,Products.IMTILAK,Products.IMTILAK_PPR,Products.SALAF_BAYTI_SANTE,Products.SALAF_BAYTI_SANTE_PPR])) {
      this.loanDataFormGroup.addControl( 'rate', new FormControl(null, [Validators.required, NumberValidators.lessThanEqualTo({ value: 100 })]) );

      this.loanDataFormGroup.addControl(
        'deadlineNumber',
        new FormControl(null, [
          Validators.required,
          NumberValidators.sumLessThanEqualTo({ conditionalExpression: () => !this.isPpoPpcFamily, fieldNameToAdd: 'delayDuration', value: 300 }),
          NumberValidators.lessThanEqualTo({ conditionalExpression: () => this.isYasserProduct(), value: 36 }),
          NumberValidators.lessThanEqualTo({ conditionalExpression: () => this.isPpoPpcProduct(), value: 120 }),
          NumberValidators.lessThanEqualTo({ conditionalExpression: () => !this.isPpoPpcFamily && this.isItABuildingLotAcquisition(), value: this.maxDeadline })
        ])
      );
    }

    if (this.loanObject.includes('AMN') || this.loanObject.includes('CST')) {
      this.loanDataFormGroup.addControl('claimedAmountOfBuildDevelopment', new FormControl(null, [
        Validators.required, 
        NumberValidators.lessThanEqualTo({ fieldName: 'buildDevelopmentQuotation' }), 
        this.equalToMechanismSum()
      ]));
    }
    if ((!this.isYassir && !this.isPpoPpc) && (this.loanObject.includes('RCH') || this.loanObject.includes('AQS') || this.loanObject?.includes('REGR_CRED')  || this.loanObject?.includes('REF_ACH_BI'))) {
      this.loanDataFormGroup.addControl('claimedAmountOfPurchase', new FormControl(null, [Validators.required,  NumberValidators.lessThanEqualTo({ fieldName: 'acquisitionPrice' })]));
    }

    if (this.isSelectedProductIn([Products.ADL_SAKANE,Products.ADL_SAKANE_PPR,Products.IMTILAK,Products.IMTILAK_PPR,Products.SALAF_BAYTI_SANTE,Products.SALAF_BAYTI_SANTE_PPR])) {

      this.loanDataFormGroup.addControl("additionalCredit", new FormControl());
      this.loanDataFormGroup.addControl("additionalCreditRate", new FormControl());
      this.loanDataFormGroup.addControl("additionalLoanDuration", new FormControl());

      if (this.isAdlSakane || this.isAdlSakanePPR ){
      this.loanDataFormGroup.addControl("typeAloanAmount", new FormControl(null, { validators: NumberValidators.lessThanEqualTo({ value: 100000 }) }));
      this.loanDataFormGroup.addControl("typeBloanAmount", new FormControl(null, { validators: NumberValidators.lessThanEqualTo({ value: 150000 }) }));
      this.loanDataFormGroup.addControl("typeAloanDuration", new FormControl(null, { validators: NumberValidators.lessThanEqualTo({ value: 120 }) }));
      this.loanDataFormGroup.addControl("typeBloanDuration", new FormControl(null, { validators: NumberValidators.lessThanEqualTo({ value: 240 }) }));
      this.loanDataFormGroup.addControl("typeAloanRate", new FormControl());
      this.loanDataFormGroup.addControl("typeBloanRate", new FormControl());

      this.loanDataFormGroup.addValidators(this.equalToMechanismSum());
      }
      if (this.isSalafBaytiSante || this.isSalafBaytiSantePPR) {
        this.loanDataFormGroup.addControl("bonusCreditAmount", new FormControl(null, { validators: NumberValidators.lessThanEqualTo({ value: 300000 }) }));
        this.loanDataFormGroup.addControl("bonusCreditRate", new FormControl());
        this.loanDataFormGroup.addControl("bonusCreditDuration", new FormControl(null, [
          NumberValidators.lessThanEqualTo({ conditionalExpression: () => this.isMechanism2(), value: 240, extraFieldsToUpdateValidator: ['mechanism'] }),
        ]))
        this.loanDataFormGroup.addValidators(this.equalToMechanismSum());
      }
      if (this.isImtilak || this.isImtilakPPR) {
        this.loanDataFormGroup.addControl("subsidizedCreditAmount", new FormControl(null, { validators: NumberValidators.lessThanEqualTo({ value: 300000 }) }));
        this.loanDataFormGroup.addControl("bonusCreditAmount", new FormControl(null, { validators: NumberValidators.lessThanEqualTo({ value: 200000 }) }));
        this.loanDataFormGroup.addControl("suportedCreditAmount", new FormControl());
        this.loanDataFormGroup.addControl("subsidizedCreditRate", new FormControl());
        this.loanDataFormGroup.addControl("bonusCreditRate", new FormControl());
        this.loanDataFormGroup.addControl("suportedCreditRate", new FormControl());
        this.loanDataFormGroup.addControl("subsidizedCreditDuration", new FormControl());
        this.loanDataFormGroup.addControl("bonusCreditDuration", new FormControl(null, [
          NumberValidators.lessThanEqualTo({ conditionalExpression: () => this.isMechanism2(), value: 180, extraFieldsToUpdateValidator: ['mechanism'] }),
        ]))
        this.loanDataFormGroup.addControl("suportedCreditDuration", new FormControl());

        this.loanDataFormGroup.addValidators(this.equalToMechanismSum());
      }

    }

    this.initInsuranceDataForm()

    this.loanDataFormGroup.addControl("applicationFee", new FormControl(null, [Validators.required]));
    this.loanDataFormGroup.addControl("freeHandFee", new FormControl(800, [Validators.required]));
    
    if (!this.isPpoPpcFamily){
      this.loanDataFormGroup.addValidators([this.applicationFeesValidator])
    }
    if (this.loanObject.includes('AQS_RCH') || (this.isPpoPpcFamily && this.isInternalRepurchaseSelected())) {
      this.loanDataFormGroup.addControl('repurchasedCreditNumber', new FormControl(null));
      this.loanDataFormGroup.addValidators(this.repurchasedCreditNumberValidator());
      this.loanDataFormGroup.updateValueAndValidity({ emitEvent: false });
    }
    /** for regrouping notary & propertyData only in front presentation**/
    this.propertyDataNotaryFormGroup = this.formBuilder.group({});
    this.propertyDataNotaryFormGroup.addControl('notary', this.formGroup.get('notary') as FormGroup);
  }

  private initInsuranceDataForm() {
    const insuranceDataFormGroup = this.formGroup.get('insuranceData') as FormGroup;
    if (!this.isSelectedProductIn([Products.ADL_SAKANE,Products.ADL_SAKANE_PPR,Products.IMTILAK,Products.IMTILAK_PPR,Products.SALAF_BAYTI_SANTE,Products.SALAF_BAYTI_SANTE_PPR])) {
      insuranceDataFormGroup.addControl("insuredPercentage", new FormControl('', [Validators.required, NumberValidators.lessThanEqualTo({ value: 100 })]));
      insuranceDataFormGroup.addControl("promotionalInsuranceRate", new FormControl());
      insuranceDataFormGroup.addControl("insuranceCoefficient", new FormControl(null, [Validators.required]));
    } else {
      if (this.isMechanism1()) {
        insuranceDataFormGroup.addControl("subsidizedInsuredPercentage", new FormControl('', [Validators.required, NumberValidators.lessThanEqualTo({ value: 100 })]));
        insuranceDataFormGroup.addControl("subsidizedPromotionalInsuranceRate", new FormControl());
        insuranceDataFormGroup.addControl("subsidizedInsuranceCoefficient", new FormControl(null, [Validators.required]));

      }
      if (this.isMechanism2()) {
        insuranceDataFormGroup.addControl("bonusInsuredPercentage", new FormControl('', [Validators.required, NumberValidators.lessThanEqualTo({ value: 100 })]));
        insuranceDataFormGroup.addControl("bonusPromotionalInsuranceRate", new FormControl());
        insuranceDataFormGroup.addControl("bonusInsuranceCoefficient", new FormControl(null, [Validators.required]));

      }
      if (this.isMechanism3()) {
        insuranceDataFormGroup.addControl("suportedInsuredPercentage", new FormControl('', [Validators.required, NumberValidators.lessThanEqualTo({ value: 100 })]));
        insuranceDataFormGroup.addControl("suportedPromotionalInsuranceRate", new FormControl());
        insuranceDataFormGroup.addControl("suportedInsuranceCoefficient", new FormControl(null, [Validators.required]));

      }
      if (this.isTypeA()) {
        insuranceDataFormGroup.addControl("typeAInsuredPercentage", new FormControl('', [Validators.required, NumberValidators.lessThanEqualTo({ value: 100 })]));
        insuranceDataFormGroup.addControl("typeAPromotionalInsuranceRate", new FormControl());
        insuranceDataFormGroup.addControl("typeAInsuranceCoefficient", new FormControl(null, [Validators.required]));

      }
      if (this.isTypeB()) {
        insuranceDataFormGroup.addControl("typeBInsuredPercentage", new FormControl('', [Validators.required, NumberValidators.lessThanEqualTo({ value: 100 })]));
        insuranceDataFormGroup.addControl("typeBPromotionalInsuranceRate", new FormControl());
        insuranceDataFormGroup.addControl("typeBInsuranceCoefficient", new FormControl(null, [Validators.required]));
      }
      if(!this.isMechanism3()){
        insuranceDataFormGroup.addControl("aditionalCreditInsuredPercentage", new FormControl('', [Validators.required, NumberValidators.lessThanEqualTo({ value: 100 })]));
        insuranceDataFormGroup.addControl("aditionalCreditPromotionalInsuranceRate", new FormControl());
        insuranceDataFormGroup.addControl("aditionalCreditInsuranceCoefficient", new FormControl(null, [Validators.required]));
      }
    }
  }
  
  private equalToMechanismSum(): ValidatorFn {
    return (control: AbstractControl): { [key: string]: any } | null => {
      const hasCstOrAmn           = this.loanObject?.includes('CST') || this.loanObject?.includes('AMN');
      const isAQS                 = this.loanObject?.includes('AQS');
      const montantConstruction   = this.loanDataFormGroup.get('claimedAmountOfBuildDevelopment')?.value;
      const montantCredit         = this.loanDataFormGroup.get('claimedAmountOfPurchase')?.value;

      const isConstructionMissing = hasCstOrAmn && montantConstruction == null;
      const isCreditMissing       = isAQS && montantCredit == null;

      if (isConstructionMissing || isCreditMissing) {
        return { equalToMechanismSum: 'incomplete' };
      }

      const totalEntered: number = NumberUtils.toForcedNumber(montantConstruction) + NumberUtils.toForcedNumber(montantCredit);

      const expectedSum = this.getSumOfMecanismAmounts();
      if (expectedSum === -1 || totalEntered >= expectedSum) {
        return null;
      }

      return { 
        equalToMechanismSum: { 
          expected: expectedSum, 
          actual: totalEntered 
        } 
      };
    };
  }

  private getSumOfMecanismAmounts(): number {
    const selectedMechanisms = this.selectedMechanism as Mechanism | Mechanism[];
    const mechanism_controls: any= {
      [MechanismType.MECHANISM_1]: ["subsidizedCreditAmount", "additionalCredit"],
      [MechanismType.MECHANISM_2]: ["bonusCreditAmount", "additionalCredit"],
      [MechanismType.MECHANISM_3]: ["suportedCreditAmount"],
      [MechanismType.TYPE_A]: ["typeAloanAmount", "additionalCredit"],
      [MechanismType.TYPE_B]: ["typeBloanAmount", "additionalCredit"],
    }
    const controls = Array.from(new Set(
      Array.isArray(selectedMechanisms)
        ? selectedMechanisms.flatMap(({ code }) => mechanism_controls[code] || [])
        : mechanism_controls[selectedMechanisms?.code] || []
    ));
    if(controls.every((el:any)=>(this.loanDataFormGroup.get(el)?.value == null || this.loanDataFormGroup.get(el)?.value === "" ))) return -1;
    const sum = controls.reduce((acc: number, el: any) => acc + this.toForcedNumber(this.loanDataFormGroup.get(el)?.value), 0);
    return sum;
  } 

  private applicationFeesValidator(control: AbstractControl): { [key: string]: any } | null {
    const parse = (val: any) => {
    if (val === null || val === undefined) return 0;
    return parseFloat(String(val).replace(',', '.').replace(/[^\d.-]/g, '')) || 0;
    };

    const claimedAmountOfPurchase = parse(control.get('claimedAmountOfPurchase')?.value);
    const claimedAmountOfBuildDevelopment = parse(control.get('claimedAmountOfBuildDevelopment')?.value);
    const requestedNotaryFee = parse(control.get('requestedNotaryFee')?.value);
    const applicationFee = parse(control.get('applicationFee')?.value);

    const sum = claimedAmountOfPurchase + claimedAmountOfBuildDevelopment + requestedNotaryFee;

    if (sum * 0.001 < applicationFee) {
    return { feeExcess: true };
   }
    return null;

  };

  private getDefaultRate( type: 'subventionné' | 'complémentaire' | 'soutenu',  years: number): number | null {
    switch (type) {
      case 'subventionné':
        if (years <= 7)   return 2.20;
        if (years <= 15)  return 2.50;
        if (years <= 25)  return 2.75;
        break;

      case 'complémentaire':
        if (years <= 7)   return 4.20;
        if (years <= 15)  return 4.50;
        if (years <= 25)  return 4.75;
        break;

      case 'soutenu':
        if (years <= 7)   return 4.20;
        if (years <= 15)  return 4.50;
        if (years <= 25)  return 4.75;
        break;
    }

    return null;
  }

  private initDurationListeners(): void {
    if (!(this.isImtilak || this.isImtilakPPR)) return;
    const subsidized$ = this.subsidizedCreditDurationFormControl.valueChanges.pipe(
      startWith(this.subsidizedCreditDurationFormControl.value),
      map(v => NumberUtils.toForcedNumber(v) / 12),
      distinctUntilChanged()
    );

    const additional$ = this.additionalloanDurationFormControl.valueChanges.pipe(
      startWith(this.additionalloanDurationFormControl.value),
      map(v => NumberUtils.toForcedNumber(v) / 12),
      distinctUntilChanged()
    );
    const supported$ = this.suportedCreditDurationFormControl.valueChanges.pipe(
      startWith(this.suportedCreditDurationFormControl.value),
      map(v => NumberUtils.toForcedNumber(v) / 12),
      distinctUntilChanged()
    );

    combineLatest([subsidized$, additional$,supported$])
      .subscribe(([subYears, addYears,supYears]) => {
        const subRate = this.getDefaultRate('subventionné', subYears);
        const addRate = this.getDefaultRate('complémentaire', addYears);
        const supRate = this.getDefaultRate('soutenu', supYears);
        if (this.isMechanism1()) {
          this.setControlNumberValue(this.subsidizedCreditRateFormControl, subRate!);
          }

          if (this.isMechanism3()) {
          this.setControlNumberValue(this.suportedCreditRateFormControl, supRate!);
          }

          if(this.isAnyMechanismOrType()){
               this.setControlNumberValue(this.additionalCreditRateFormControl, addRate!);
          }
      });
  }

  public isYasserProduct() {
    return this.isSelectedProductIn([Products.YASSIR,Products.YASSIR_PPR]);
  }

  public isPpoPpcProduct(){
    return this.isSelectedProductIn([Products.PPO,Products.PPO_PPR,Products.PPC]);
  }

  public isItABuildingLotAcquisition() {
    return this.loanObject === 'AQS' &&  this.propertyType === 'TRN';
  }

  calculateApplicationFee() {
    if(this.isPpoPpcFamily) return;
    const claimedAmountOfPurchase = this.loanDataFormGroup.get('claimedAmountOfPurchase');
    const claimedAmountOfBuildDevelopment = this.loanDataFormGroup.get('claimedAmountOfBuildDevelopment');
    const requestedNotaryFee = this.loanDataFormGroup.get('requestedNotaryFee');

    let sum = 0;
    if(claimedAmountOfPurchase?.value){
      sum += claimedAmountOfPurchase?.value;
    }
    if(claimedAmountOfBuildDevelopment?.value){
      sum += claimedAmountOfBuildDevelopment?.value;
    }
    if(requestedNotaryFee?.value){
      sum += requestedNotaryFee?.value;
    }

    this.applicationFeeFormControl?.patchValue(NumberUtils.round(sum/1000, 2));
  }

  private initCoefficientWithFallback(savedValue: any, control: FormControl, computeFallback: () => void): void {
    if (savedValue !== undefined && savedValue !== null) {
      control.setValue(this.decimalPipe.transform(savedValue, '1.4-4'));
    } else {
      computeFallback();
    }
  }

  private computeInsuranceCoefficient(promotionalRate: any, Amount: number): string | null {
    Amount = NumberUtils.toForcedNumber(Amount);

    promotionalRate = NumberUtils.toForcedNumber(promotionalRate);
    let rate = 0;

    if (promotionalRate > 0) {
      rate = promotionalRate / 12;
      const decimalString: string = rate.toString();
      const dotIndex = decimalString.indexOf('.');
      if (dotIndex !== -1) {
        const truncatedString: string = decimalString.substring(0, dotIndex + 4);
        rate = Number(truncatedString);
      }
    } else if (Amount >= 600000) {
      rate = 0.035;
    } else {
      rate = 0.04;
    }

    return this.decimalPipe.transform(Number(rate * 1.1 * 12), '1.4-4');
  }

  calculateInsuranceCoefficient() {
    if(this.isPpoPpcFamily){
      let coefficient = this.decimalPipe.transform( 0.8,    '1.4-4' );
      coefficient = coefficient ? coefficient.replace(/\s/g, "").replace(".", ",") : "0";
      this.insuranceCoefficientFormControl.setValue(coefficient);
      return;
    }
    const loanAmount = this.data.loanData?.loanAmount;
    const promotionalRate = this.promotionalInsuranceRateFormControl?.value;
    const coefficient = this.computeInsuranceCoefficient(promotionalRate, loanAmount);
    this.insuranceCoefficientFormControl.setValue(coefficient);
  }

  calculateSubsidizedInsuranceCoefficient() {
    const subsidizedCreditAmount = this.data.loanData?.subsidizedCreditAmount;
    const promotionalRate = this.subsidizedPromotionalInsuranceRateFormControl?.value;
    const coefficient = this.computeInsuranceCoefficient(promotionalRate, subsidizedCreditAmount);
    this.subsidizedInsuranceCoefficientFormControl.setValue(coefficient);
  }

  calculateBonusInsuranceCoefficient() {
    const bonusCreditAmount = this.data.loanData?.bonusCreditAmount;
    const promotionalRate = this.bonusPromotionalInsuranceRateFormControl?.value;
    const coefficient = this.computeInsuranceCoefficient(promotionalRate, bonusCreditAmount);
    this.bonusInsuranceCoefficientFormControl.setValue(coefficient);
  }

  calculateSuportedInsuranceCoefficient() {
    const suportedCreditAmount = this.data.loanData?.suportedCreditAmount;
    const promotionalRate = this.suportedPromotionalInsuranceRateFormControl?.value;
    const coefficient = this.computeInsuranceCoefficient(promotionalRate, suportedCreditAmount);
    this.suportedInsuranceCoefficientFormControl.setValue(coefficient);
  }

  calculateTypeAInsuranceCoefficient() {
    const loanAmount = this.data.loanData?.typeAloanAmount;
    const promotionalRate = this.typeAPromotionalInsuranceRateFormControl?.value;
    const coefficient = this.computeInsuranceCoefficient(promotionalRate, loanAmount);
    this.typeAInsuranceCoefficientFormControl.setValue(coefficient);
  }

  calculateTypeBInsuranceCoefficient() {
    const loanAmount = this.data.loanData?.typeBloanAmount;
    const promotionalRate = this.typeBPromotionalInsuranceRateFormControl?.value;
    const coefficient = this.computeInsuranceCoefficient(promotionalRate, loanAmount);
    this.typeBInsuranceCoefficientFormControl.setValue(coefficient);
  }

  calculateAdditionalInsuranceCoefficient() {
    const loanAmount = this.data.loanData?.additionalCredit;
    const promotionalRate = this.aditionalCreditPromotionalInsuranceRateFormControl?.value;
    const coefficient = this.computeInsuranceCoefficient(promotionalRate, loanAmount);
    this.aditionalCreditInsuranceCoefficientFormControl.setValue(coefficient);
  }

  initCappedRateValidators() {
    this.formGroup.get('loanData.rateType.code')?.valueChanges.subscribe(value => {
      if (value === this.rateTypes.CAPE) {
        this.cappedRateFormControl?.addValidators([Validators.required, NumberValidators.greaterThanEqualTo({ fieldName: 'rate' })]);
      } else {
        this.cappedRateFormControl?.removeValidators([Validators.required, NumberValidators.greaterThanEqualTo({ fieldName: 'rate' })]);
        this.cappedRateFormControl?.reset();
      }
      this.cappedRateFormControl?.updateValueAndValidity();
    });
  }

  initClaimedAmountOfPurchaseValidators(){
    if(!this.isYassir && !this.isPpoPpc) return;

    if(this.isYassir){
      this.setControlNumberValue(this.rateFormControl, 0);
      this.rateFormControl.disable();
    }
   
    this.loanDataFormGroup.addControl('claimedAmountOfPurchase', new FormControl(null, [
      Validators.required,  
      NumberValidators.lessThanEqualTo({ conditionalExpression: () => this.loanObject.includes('AQS'), fieldName: 'acquisitionPrice' }),
      DossierValidators.lessThanEqualToFixValue(() => this.isYassir, this.loanDataFormGroup,  30000)
    ]));
    this.claimedAmountOfPurchaseFormControl?.updateValueAndValidity();
  }

  private initDelayedType() {
      this.delayTypes$?.subscribe();
  }

  private initDelayed() {
    this.getControlValueChanges(this.delayedFormControl).subscribe(value => {
    const isPPRProduct= this.isImtilakPPR || this.isAdlSakanePPR||this.isSalafBaytiSantePPR;
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

  compareObjects(o1: any, o2: any): boolean {
    return o1?.code === o2?.code
  }


  onValidate(): void {
    if (!this.formGroup.valid) {
      const errors: any[] = [];
      this.calculateFormValidationErrors(this.formGroup, errors);

      const errorMessage = errors.length > 0
        ? errors.filter(({ errorName }) => errorName !== 'required')
                .map(({ controlName }) => controlName)
                .join('\n')
        : '';

      this.showErrorMessage({ bodyKey: "Veuillez vérifier les champs " + (errorMessage || '') });
      return;
    }

    if (this.isFormValuesChanged()) {
      const emitData = {
        ...this.formGroup.getRawValue(),
        warranties: this.warranties
          .map(({id, type, ...rest}) => ({ ...rest, id: type === WarrantyType.AUTO || (this.data.isEdit && type === WarrantyType.TO_COLLECT ) ? id : null })),
        restrictions: this.restrictions,
      };
      this.returnToDecision.emit(emitData);
      this.dossierStore.update({ propertyData: this.oldPropertyData });
      this.changeDetectorRef.detectChanges();
      return;
    }

    this.showErrorMessage({ bodyKey: "Aucun changement n'a été effectué !" });
  }


  isFormValuesChanged(): boolean {
    const { loanData, insuranceData, propertyData, beneficiaries, guarantors, representatives, notary, warranties , restrictions } =
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
      restrictions: this.restrictions ?? [],
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

    const initialObject = { loanData, insuranceData, propertyData, beneficiaries, guarantors, representatives, notary: notary ?? {}, warranties , restrictions};
    const cleanedCurrent = ObjectUtils.mergeFormWithInitial(initialObject, newFormObject);
    const modifications = ObjectUtils.diffObjects(initialObject, cleanedCurrent);

    return Object.keys(modifications).length > 0;
  }

  addWarranty(event: MatChipInputEvent): void {
    const value = (event.value || '').trim();
    if (value && value.trim() !== '') {
      const warranty: Warranty = {
        content: value,
        type: WarrantyType.PROPOSED
      };
      this.warranties.push(warranty);
      this.warrantiesSubject.next(this.warranties);
    }
    event.chipInput!.clear();
  }
  
  private buildProposedRestrictionType(family: RestrictionType): RestrictionType {
    if (family === RestrictionType.DSC) {
      return this.isCtb ? RestrictionType.PROPOSED_CTB : RestrictionType.PROPOSED_DSC;
    }
    return this.isCtb ? RestrictionType.PROPOSED_OBSERVATION_CTB : RestrictionType.PROPOSED_OBSERVATION;
  }

  removeWarranty(index: number, isAuto: boolean): void {
    if (index >= 0 && !isAuto) {
      this.warranties.splice(index, 1);
      this.warrantiesSubject.next(this.warranties);
    }
  }

  addRestriction(event: MatChipInputEvent, type: RestrictionType): void {
    const value = (event.value || '').trim();
    if (value && value.trim() !== '') {
      const restriction: Restriction = {
        content: value,
        type: this.buildProposedRestrictionType(type)
      };
      this.restrictions.push(restriction);
      this.restrictionsSubject.next(this.restrictions);
    }
    event.chipInput!.clear();
  }

  removeRestriction(restriction: Restriction): void {
    const removeIndex = this.restrictions.indexOf(restriction);
    if (removeIndex >= 0) {
      this.restrictions.splice(removeIndex, 1);
      this.restrictionsSubject.next([...this.restrictions]);
    }
  }

  filterRestrictionByType(restrictions: Restriction[], type: RestrictionType) {
    if (type === RestrictionType.DSC) {
      return restrictions.filter(r =>
        r.type === RestrictionType.DSC || r.type === RestrictionType.PROPOSED_DSC || (this.isCtb && r.type === RestrictionType.PROPOSED_CTB)
      );
    }
    if (type === RestrictionType.OBSERVATION) {
      return restrictions.filter(r =>
        r.type === RestrictionType.OBSERVATION || r.type === RestrictionType.PROPOSED_OBSERVATION || (this.isCtb && r.type === RestrictionType.PROPOSED_OBSERVATION_CTB)
      );
    }
    return restrictions.filter(r => r.type?.includes(type));
  }

  update = () => {
    const dossier = this.dossierStore.get();
    this.dossierStore.update({
      ...dossier,
      ...this.formGroupRawValue,
    });
  }

  updatePropertyData(dossierPayload: any, savedDossier: any) {
    const propertyData = dossierPayload.propertyData;
    const newPropertyData: PropertyData = {
      ...propertyData,
      properties: savedDossier?.propertyData?.properties ?? propertyData?.properties,
      coFinancing: savedDossier?.propertyData?.coFinancing ?? propertyData?.coFinancing
    };

    this.dossierStore.update({ propertyData: newPropertyData }, false);
  }

  private setupLoanCalculationListeners() {
    const isNotaryFeesActive:boolean = this.isPPIProduct || (this.isPpiMRE && this.isClipriMRE);
    this.loanCalculationService.setupInvestmentAmount(this.loanDataFormGroup, { isNotaryFeesActive }, this.destroy$);
  }

  private fieldsClearingCondition(fileds: 'Notary'): boolean {
    const dossier = this.dossierStore.get();
    const product = dossier.product?.code

    const allowedCodesByField: Record<typeof fileds, string[]> = {
      Notary: [Products.MOULKIA.toString(), Products.PPI_VEFA.toString(), Products.YASSIR.toString(), Products.YASSIR_PPR.toString(), Products.PPO.toString(), Products.PPO_PPR.toString(), Products.PPC.toString(),]
    };

    return (
      this.dossierAccordPrincipe ||
      this.isProspect ||
      allowedCodesByField[fileds].includes(product!)
    );
  }

  updateNotaryValidations() {
    if (!this.formGroup || !this.notaryFormGroup) return;

    if (this.fieldsClearingCondition('Notary')) {
      this.clearNotaryFieldValidators();
    }

    // Mise à jour sécurisée de la validité
    this.notaryMailFormControl?.updateValueAndValidity();
    this.notaryPhoneFormControl?.updateValueAndValidity();
    this.notaryFormGroup.get('name')?.updateValueAndValidity();
    this.notaryFormGroup.get('address')?.updateValueAndValidity();
  }

  private clearNotaryFieldValidators(): void {
    this.notaryMailFormControl.clearValidators();
    this.notaryPhoneFormControl.clearValidators();
    this.notaryMailFormControl.addValidators([Validators.email]);
    this.notaryPhoneFormControl.addValidators([Validators.pattern('^(0[0-9]{9}|\\+?[1-9]\\d{1,14})$')]);
    this.notaryFormGroup.get('name')?.clearValidators();
    this.notaryFormGroup.get('address')?.clearValidators();
  }

  private repurchasedCreditNumberValidator(): ValidatorFn {
   return (group: AbstractControl): ValidationErrors | null => {
    const fg = group as FormGroup;
    // Si pas de prêt rachat, pas de validation
    const loanObject = this.loanObject ?? '';
    const isAqsRepurchase = loanObject.includes('AQS_RCH');
    const isInternalPpoPpcRepurchase = this.isPpoPpcFamily && this.isInternalRepurchaseSelected(fg.get('repurchaseTypes')?.value);
    if (!isAqsRepurchase && !isInternalPpoPpcRepurchase) return null;


    const value: string = (fg.get('repurchasedCreditNumber')?.value ?? '').toString().trim();
    if (!value) {
      return { repurchasedCreditNumberRequired: true };
    }

    const dossier = this.dossierStore.get();
    const debts = dossier?.debts ?? [];
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

    if (!found) {
      return { repurchasedCreditNotFound: true };
    }

      return null;
    };
  }
  public isInternalRepurchaseSelected(value = this.loanDataFormGroup?.get('repurchaseTypes')?.value): boolean {
    if (Array.isArray(value)) {
      return value.some(
        item => item?.code === 'INT' || item === 'INT'
      );
    }

    return value?.code === 'INT' || value === 'INT';
  }

  private notaryFeeRuleConfig(loanObjectCode?: string):{ isEligible: boolean, coefficient: number } {
    const code = loanObjectCode ?? '';

    const isAqs = code.includes('AQS');
    const isOnlyRch = code.includes('RCH') && !code.includes('AQS');
    const isConventionedProducts = this.isSelectedProductIn([Products.IMTILAK, Products.IMTILAK_PPR, Products.ADL_SAKANE, Products.ADL_SAKANE_PPR, Products.SALAF_BAYTI_SANTE, Products.SALAF_BAYTI_SANTE_PPR]);
    const isPPIEngagementPromoteur = this.isSelectedProduct(Products.PPI_Engagement_Promoteur);
    return {
      isEligible: (isAqs || isOnlyRch) && (this.isPPIProduct || ((this.isPpiMRE || isConventionedProducts || isPPIEngagementPromoteur) && this.isClipriMRE)),
      coefficient:  isAqs ? 0.08 : 0.04
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Montant demandé
  //    = claimedAmountOfBuildDevelopment + claimedAmountOfPurchase [+ requestedNotaryFee si PPI/ClipriMRE]
  //    → met aussi à jour applicationFee (loanAmount × 0.001)
  //    → notifie TopVipService
  // ───────────────────────────────────────────────────────────────────────────
  private calculateLoanAmountListener(): void {
    const buildCost$ = this.getControlValueChanges( this.claimedAmountOfBuildFormControl,  0,  this.claimedAmountOfBuildFormControl?.value);
    const purchase$  = this.getControlValueChanges(  this.claimedAmountOfPurchaseFormControl, 0, this.claimedAmountOfPurchaseFormControl?.value );
    const notary$    = this.getControlValueChanges(this.requestedNotaryFeeFormControl, 0, this.requestedNotaryFeeFormControl?.value);
  
    merge(buildCost$, purchase$, notary$)
      .pipe(
        takeUntil(this.destroy$),
        map(() => this.calculateLoanAmount()),
        tap(loanSum => {          
          this.setControlNumberValue(this.loanDataFormGroup.get('loanAmount'), loanSum);
          if(!this.isPpoPpcFamily){
            const applicationFee = NumberUtils.round(loanSum * 0.001, 2);
            this.setControlNumberValue(this.loanDataFormGroup.get('applicationFee'), applicationFee);
          }
          this.topVipService.next(loanSum);
        })
      )
      .subscribe();
  }
  

  get formGroupRawValue(): any {
    return this.formGroup.getRawValue();
  }

  get cappedRateFormControl() {
    return this.formGroup.get('loanData.cappedRate') as FormControl;
  }

  get applicationFeeFormControl() {
    return this.loanDataFormGroup.get('applicationFee') as FormControl;
  }
  get insuranceCoefficientFormControl() {
    return this.formGroup.get('insuranceData.insuranceCoefficient') as FormControl;
  }

  get aditionalCreditPromotionalInsuranceRateFormControl() {
    return this.formGroup.get("insuranceData.aditionalCreditPromotionalInsuranceRate") as FormControl;
  }

  get aditionalCreditInsuredPercentageFormControl() {
    return this.formGroup.get("insuranceData.aditionalCreditInsuredPercentage") as FormControl;
  }

  get aditionalCreditInsuranceCoefficientFormControl() {
    return this.formGroup.get("insuranceData.aditionalCreditInsuranceCoefficient") as FormControl;
  }

  get subsidizedPromotionalInsuranceRateFormControl() {
    return this.formGroup.get("insuranceData.subsidizedPromotionalInsuranceRate") as FormControl;
  }
  get bonusPromotionalInsuranceRateFormControl() {
    return this.formGroup.get("insuranceData.bonusPromotionalInsuranceRate") as FormControl;
  }

  get suportedPromotionalInsuranceRateFormControl() {
    return this.formGroup.get("insuranceData.suportedPromotionalInsuranceRate") as FormControl;
  }

  get subsidizedInsuranceCoefficientFormControl() {
    return this.formGroup.get("insuranceData.subsidizedInsuranceCoefficient") as FormControl;
  }

  get bonusInsuranceCoefficientFormControl() {
    return this.formGroup.get("insuranceData.bonusInsuranceCoefficient") as FormControl;
  }

  get suportedInsuranceCoefficientFormControl() {
    return this.formGroup.get("insuranceData.suportedInsuranceCoefficient") as FormControl;
  }

  get subsidizedInsuredPercentageFormControl() {
    return this.formGroup.get("insuranceData.subsidizedInsuredPercentage") as FormControl;
  }

  get bonusInsuredPercentageFormControl() {
    return this.formGroup.get("insuranceData.bonusInsuredPercentage") as FormControl;
  }

  get suportedInsuredPercentageFormControl() {
    return this.formGroup.get("insuranceData.suportedInsuredPercentage") as FormControl;
  }
  get typeAPromotionalInsuranceRateFormControl() {
    return this.formGroup.get("insuranceData.typeAPromotionalInsuranceRate") as FormControl;
  }

  get typeAInsuredPercentageFormControl() {
    return this.formGroup.get("insuranceData.typeAInsuredPercentage") as FormControl;
  }

  get typeAInsuranceCoefficientFormControl() {
    return this.formGroup.get("insuranceData.typeAInsuranceCoefficient") as FormControl;
  }

  get typeBPromotionalInsuranceRateFormControl() {
    return this.formGroup.get("insuranceData.typeBPromotionalInsuranceRate") as FormControl;
  }

  get typeBInsuredPercentageFormControl() {
    return this.formGroup.get("insuranceData.typeBInsuredPercentage") as FormControl;
  }

  get typeBInsuranceCoefficientFormControl() {
    return this.formGroup.get("insuranceData.typeBInsuranceCoefficient") as FormControl;
  }
  get deadlineNumberFormControl() {
    return this.loanDataFormGroup.get('deadlineNumber') as FormControl;
  }
  get delayedFormControl() {
    return this.loanDataFormGroup.get('delayed') as FormControl;
  }
  get delayDurationFormControl() {
    return this.loanDataFormGroup.get('delayDuration') as FormControl;
  }
  get rateTypeCodeFormControl() {
    return this.formGroup.get('loanData.rateType.code') as FormControl;
  }

  get loanDataFormGroup() {
    return this.formGroup.get('loanData') as FormGroup;
  }
  get delayed() {
    return this.formGroup?.get('loanData.delayed')?.value;
  }
  get acquisitionPriceFormControl() {
    return this.loanDataFormGroup?.get('acquisitionPrice');
  }
  get delayType() {
    return this.formGroup?.get('loanData.delayType')?.value;
  }
  get delayDuration() {
    return this.formGroup?.get('loanData.delayDuration')?.value;
  }
  get rateFormControl() {
    return this.formGroup.get('loanData.rate') as FormControl;
  }
  get delayTypeFormControl() {
    return this.formGroup?.get('loanData.delayType') as FormControl;
  }

  get subsidizedCreditDurationFormControl() {
    return this.loanDataFormGroup.get('subsidizedCreditDuration') as FormControl;
  }
  get bonusCreditDurationFormControl() {
    return this.loanDataFormGroup.get('bonusCreditDuration') as FormControl;
  }
  get suportedCreditDurationFormControl() {
    return this.loanDataFormGroup.get('suportedCreditDuration') as FormControl;
  }
  get additionalloanDurationFormControl() {
    return this.loanDataFormGroup.get('additionalLoanDuration') as FormControl;
  }
  get subsidizedCreditRateFormControl() {
    return this.loanDataFormGroup.get('subsidizedCreditRate') as FormControl;
  }
  get bonusCreditRateFormControl() {
    return this.loanDataFormGroup.get('bonusCreditRate') as FormControl;
  }
  get suportedCreditRateFormControl() {
    return this.loanDataFormGroup.get('suportedCreditRate') as FormControl;
  }
  get additionalCreditRateFormControl() {
    return this.loanDataFormGroup.get('additionalCreditRate') as FormControl;
  }

  get notaryPhoneFormControl(): FormControl {
    return this.notaryFormGroup?.get('phone') as FormControl;
  }

  get notaryMailFormControl(): FormControl {
    return this.notaryFormGroup?.get('email') as FormControl;
  }
  get propertyDataFormGroup(): FormGroup {
    return this.formGroup.get('propertyData') as FormGroup;
  }

  get notaryFormGroup(): FormGroup {
    return this.formGroup.get('notary') as FormGroup;
  }

  public isMechanism1() {
    return this.isMechanismExists(this.selectedMechanism, MechanismType.MECHANISM_1);
  }

  public isMechanism2() {
    return this.isMechanismExists(this.selectedMechanism, MechanismType.MECHANISM_2);
  }

  public isMechanism3() {
    return this.isMechanismExists(this.selectedMechanism, MechanismType.MECHANISM_3);
  }
  public isTypeA() {
    return this.isMechanismExists(this.selectedMechanism, MechanismType.TYPE_A);
  }

  public isTypeB() {
    return this.isMechanismExists(this.selectedMechanism, MechanismType.TYPE_B);
  }

  private isMechanismExists(arrayValues: Mechanism | Mechanism[], value: string): boolean {
    if (!Array.isArray(arrayValues)) {
      arrayValues = [arrayValues];
    }
    return !!arrayValues.find(mechanism => mechanism && mechanism.code === value);
  }

  get claimedAmountOfBuildFormControl() { return this.loanDataFormGroup.get('claimedAmountOfBuildDevelopment') as FormControl; }
  
  get promotionalInsuranceRateFormControl() {
    return this.formGroup?.get("insuranceData.promotionalInsuranceRate") as FormControl;
  }
  get claimedAmountOfPurchaseFormControl() {
    return this.loanDataFormGroup.get('claimedAmountOfPurchase') as FormControl;
  }

  get warrantiesFormArray(): FormArray {
    return this.formGroup.controls['warranties'] as FormArray;
  }
  get restrictionsFormArray(): FormArray {
    return this.formGroup.controls['restrictions'] as FormArray;
  }

  get beneficiariesFormArray(): FormArray {
    return this.formGroup.controls['beneficiaries'] as FormArray;
  }

  get guarantorsFormArray(): FormArray {
    return this.formGroup.controls['guarantors'] as FormArray;
  }

  get representativesFormArray(): FormArray {
    return this.formGroup.controls['representatives'] as FormArray;
  }

  get acquisitionFeeFormControl() { return this.loanDataFormGroup.get('acquisitionFee') as FormControl;}
  get requestedNotaryFeeFormControl() { return this.loanDataFormGroup?.get('requestedNotaryFee') as FormControl; }

  get showRiskAgreementWarningForPpoPpc(): boolean {
  const isTargetProduct = this.isSelectedProductIn([Products.PPO, Products.PPC]); 
  const duration = this.toForcedNumber(this.deadlineNumberFormControl?.value);
  return isTargetProduct && duration > 84;
}

}




// HTML
<form [formGroup]="formGroup" autocomplete="off" class="initiation-form">
    <app-stepper #principalStepper linear="false" [showIndicator]="false" [showNavigationButtons]="false"
      [showNavigationList]="false">
      <ng-template #additionalActions>
        <div class="dossierNumber" (click)="goBack.emit()">
          <img src="../../../../assets/svg/dossierNumber.svg" width="20" alt="dossier Number" />
          <span *ngIf="data?.codeDossier">N°{{data?.codeDossier}}</span>
        </div>
      </ng-template>
      <cdk-step>
        <ng-template cdkStepLabel>
          <span>{{"customer.loan.initiation.steps.loandata.label" | translate}}</span>
        </ng-template>
        <app-stepper [nextFunction]="nextStep" [doneFunction]="doneStepper" [firstPreviousFunction]="previousStepper"
          [showNavigationList]="false" doneButtonLabel="Valider" (selectionChange)="onSelectionChange($event)" >
          <cdk-step *ngIf="!dossierAccordPrincipe">
            <div class="step-header">
              <div class="step-title-container">
                <div class="step-visual">
                  <img src="../../../../assets/img/steps/credit-informations.svg" width="200" alt="Données Crédit">
                </div>
                <div class="step-title-wrapper">
                  <h2 class="step-title">
                    1. {{"customer.loan.initiation.steps.loandata.label" | translate}}
                  </h2>
                  <p class="step-description">
                    {{"customer.loan.initiation.steps.loandata.text" | translate}}
                  </p>
                </div>
              </div>
            </div>
            <div class="step-form" formGroupName="loanData">
              <div class="stepper-content-body">
                <div class="step-form-container">
                  <div class="row" >
                    <div class="col-6 mb-4" *ngIf="(!isYassir && !isPpoPpc ) || ( (isPpoPpc || isYassir) && loanObject?.includes('AQS'))">
                      <div class="form-control-wrapper disabled">
                        <label class="form-control-label">{{"loan.acquisition.price.label" | translate}}</label>
                        <div class="form-control-container">
                          <input class="form-control-input" appDecimalI18n type="text" formControlName="acquisitionPrice" [readonly]="true"/>
                        </div>
                      </div>
                    </div>

                    <div class="col-6 mb-4" *ngIf="loanObject.includes('CST') || loanObject.includes('AMN')">
                      <div class="form-control-wrapper disabled">
                        <label class="form-control-label"> {{ "loan.build.quotation" | translate }} </label>
                        <div class="form-control-container">
                          <input class="form-control-input" appDecimalI18n type="text"
                                formControlName="buildDevelopmentQuotation" [readonly]="true"/>
                        </div>
                      </div>
                    </div>

                    <div class="col-6 mb-4" *ngIf="(!isYassir && !isPpoPpc) || ( (isPpoPpc || isYassir) && loanObject?.includes('AQS'))">
                      <div class="form-control-wrapper disabled">
                        <label class="form-control-label">
                          {{ "loan.investment.amount" | translate }}
                        </label>
                        <div class="form-control-container">
                          <input class="form-control-input" [readonly]="true" appDecimalI18n type="text"
                                formControlName="investmentAmount" />

                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="row row-cols-2">
                    <div class="col mb-4" *ngIf="loanObject?.includes('AQS') || loanObject?.includes('RCH') || loanObject?.includes('REGR_CRED')  || loanObject?.includes('REF_ACH_BI') || isYassir || isPpoPpc">
                      <div class="form-control-wrapper">
                        <label class="form-control-label">
                          <span *ngIf="isYassir; else DefaultLabel"> 
                            {{ 'loan.bonusCreditAmount.yassir.label' | translate }} 
                          </span>

                          <ng-template #DefaultLabel> 
                            {{ "loan.claimed.amount.purchase" | translate }} 
                          </ng-template>
                        </label>
                        <div class="form-control-container">
                          <input class="form-control-input" type="text" appDecimalI18n formControlName="claimedAmountOfPurchase" (blur)="calculateApplicationFee()" />
                          <div class="error-stack">
                            <div class="error-container" *ngIf="formGroup.get('loanData.claimedAmountOfPurchase')?.hasError('lessThanEqualTo')">
                              <span>{{ "loan.amounts.acquisition.message" | translate}}</span>
                            </div>
                            <div class="error-container" *ngIf="formGroup.get('loanData.claimedAmountOfPurchase')?.hasError('required')">
                              <span>{{"field.requierd.error.message" | translate}}</span>
                            </div>
                            <div class="error-container" *ngIf="formGroup.get('loanData.claimedAmountOfPurchase')?.hasError('lessThanEqualToFixedValue') && isYassir">
                              <span>{{ "loan.bonusCreditAmount.yassir.error.message" | translate}}</span>
                            </div>
                            
                            <div class="error-container" *ngIf="loanDataFormGroup?.errors?.equalToMechanismSum && formGroup.get('loanData')?.touched">
                              <span>{{ "loan.amounts.sum.equal.error" | translate }}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div class="col mb-4" *ngIf="loanObject?.includes('CST') || loanObject?.includes('AMN')">
                      <div class="form-control-wrapper">
                        <label class="form-control-label">{{ ("loan.claimed.amount.build" | translate) | slice:0:35
                          }}</label>
                        <div class="form-control-container">
                          <input class="form-control-input" type="text" appDecimalI18n
                            formControlName="claimedAmountOfBuildDevelopment" (blur)="calculateApplicationFee()" />
                          <div class="error-container"
                            *ngIf="formGroup.get('loanData.claimedAmountOfBuildDevelopment')?.hasError('lessThanEqualTo')">
                            <span>{{"loan.amounts.quotation.message"| translate}}</span>
                          </div>
                          <div class="error-container"
                            *ngIf="formGroup.get('loanData.claimedAmountOfBuildDevelopment')?.hasError('required')">
                            <span>{{ "field.requierd.error.message" | translate}}</span>
                          </div>
                          <div class="error-container" *ngIf="formGroup.get('loanData.claimedAmountOfBuildDevelopment')?.hasError('equalToMechanismSum')">
                            <span>{{ "loan.amounts.sum.equal.error" | translate }}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <ng-container *ngIf="notaryFeeRule.isEligible">
                      <div class="col mb-4">
                        <div class="form-control-wrapper">
                          <label class="form-control-label">{{ "loan.acquisition.fee.label" | translate }}</label>
                          <div class="form-control-container">
                            <input class="form-control-input" appDecimalI18n formControlName="acquisitionFee"/>
                          </div>
                        </div>
                      </div>
                      <div class="col mb-4"s>
                        <div class="form-control-wrapper">
                          <label class="form-control-label">{{ "loan.claimed.amount.purchase.including.notaryFees" |
                            translate | slice:0:35}}</label>
                          <div class="form-control-container">
                            <input class="form-control-input" type="text" appDecimalI18n
                              formControlName="requestedNotaryFee" (blur)="calculateApplicationFee()" />
                            <div class="error-container error-message " *ngIf="acquisitionPriceFormControl?.hasError('sumPercentLessThanEqualTo')">
                              <span>{{ "loan.claimed.amount.purchase.including.notaryFees.error" | translate : {maxPercent:acquisitionPriceFormControl?.errors?.['sumPercentLessThanEqualTo']?.maxPercent} }}</span>
                            </div>                                        
                            <div class="error-container error-message" *ngIf="requestedNotaryFeeFormControl?.hasError('lessThanEqualTo')">
                              <span>{{ "loan.claimed.amount.purchase.including.notaryFees.message" | translate}}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </ng-container>
                    <div class="col mb-4" *ngIf="loanObject?.includes('AQS_RCH') || (isPpoPpcFamily && isInternalRepurchaseSelected())">
                        <div class="form-control-wrapper"
                            [ngClass]="{
                                'has-error': loanDataFormGroup.get('repurchasedCreditNumber')?.invalid &&
                                            (loanDataFormGroup.get('repurchasedCreditNumber')?.dirty || loanDataFormGroup.get('repurchasedCreditNumber')?.touched)
                            }">
                          <label class="form-control-label">
                            {{ 'loan.repurchasedCreditNumber.label' | translate }}<span class="required">*</span>
                          </label>
                          <div class="form-control-container">
                            <input class="form-control-input"
                                  type="text"
                                  formControlName="repurchasedCreditNumber"
                                  maxlength="255" />
                            <div class="error-container"
                                *ngIf="loanDataFormGroup.hasError('repurchasedCreditNumberRequired') && (loanDataFormGroup.get('repurchasedCreditNumber')?.dirty || loanDataFormGroup.get('repurchasedCreditNumber')?.touched)">
                              <span>{{ 'field.requierd.error.message' | translate }}</span>
                            </div>
                            <div class="error-container"
                                *ngIf="loanDataFormGroup.hasError('repurchasedCreditNotFound') && (loanDataFormGroup.get('repurchasedCreditNumber')?.dirty || loanDataFormGroup.get('repurchasedCreditNumber')?.touched)">
                              <span>{{ 'loan.repurchasedCreditNumber.warningNotFound' | translate }}</span>
                            </div>
                          </div>
                        </div>
                    </div>
                    <ng-container *ngIf="isSelectedProductIn(['ADL_SAKANE','ADL_SAKANE_PPR','IMTILAK','IMTILAK_PPR','SALAF_BAYTI_SANTE','SALAF_BAYTI_SANTE_PPR'])">
                      <div class="col mb-4" *ngIf="isMechanism1()">
                        <div class="form-control-wrapper">
                          <label class="form-control-label">{{ "loan.subsidizedCreditAmount.label" | translate }}</label>
                          <div class="form-control-container">
                            <input class="form-control-input" appDecimalI18n type="text"
                              formControlName="subsidizedCreditAmount" />
                          </div>
                          <div class="error-container"
                            *ngIf="formGroup.get('loanData.subsidizedCreditAmount')?.hasError('lessThanEqualTo')">
                            <span>{{ "loan.subsidizedCreditAmount.message" | translate}}</span>
                          </div>
                        </div>
                      </div>
                      <div class="col mb-4" *ngIf="isMechanism2()">
                        <div class="form-control-wrapper">
                          <label class="form-control-label">{{ "loan.bonusCreditAmount.label" | translate }}</label>
                          <div class="form-control-container">
                            <input class="form-control-input" appDecimalI18n type="text"
                              formControlName="bonusCreditAmount" />
                          </div>
                          <div class="error-container"
                            *ngIf="formGroup.get('loanData.bonusCreditAmount')?.hasError('lessThanEqualTo')">
                            <ng-container
                              *ngIf="isSelectedProductIn(['SALAF_BAYTI_SANTE','SALAF_BAYTI_SANTE_PPR']); else defaultMessage">
                              <span>{{ "loan.bonusCreditAmount.SalafBaytiSante.message" | translate}}</span>
                            </ng-container>
                            <ng-template #defaultMessage>
                              <span> {{ "loan.bonusCreditAmount.message" | translate }}</span>
                            </ng-template>
                          </div>
                        </div>
                      </div>
                      <div class="col mb-4" *ngIf="isMechanism3()">
                        <div class="form-control-wrapper">
                          <label class="form-control-label">{{ "loan.suportedCreditAmount.label" | translate }}</label>
                          <div class="form-control-container">
                            <input class="form-control-input" appDecimalI18n type="text"
                              formControlName="suportedCreditAmount" />
                          </div>
                          <div class="error-container"
                            *ngIf="formGroup.get('loanData.suportedCreditAmount')?.hasError('lessThanEqualTo')">
                            <span>{{ "loan.suportedCreditAmount.error.message" | translate}}</span>
                          </div>
                        </div>
                      </div>
                      <div class="col mb-4" *ngIf="isTypeA()">
                        <div class="form-control-wrapper">
                          <label class="form-control-label">{{ "loan.typeAloanAmount.label" | translate }}</label>
                          <div class="form-control-container">
                            <input class="form-control-input" appDecimalI18n type="text"
                              formControlName="typeAloanAmount" />
                          </div>
                          <div class="error-container"
                            *ngIf="formGroup.get('loanData.typeAloanAmount')?.hasError('lessThanEqualTo')">
                            <span>{{ "loan.typeAloanAmount.error.message" | translate}}</span>
                          </div>
                        </div>
                      </div>
                      <div class="col mb-4" *ngIf="isTypeB()">
                        <div class="form-control-wrapper">
                          <label class="form-control-label">{{ "loan.typeBloanAmount.label" | translate }}</label>
                          <div class="form-control-container">
                            <input class="form-control-input" appDecimalI18n type="text"
                              formControlName="typeBloanAmount" />
                          </div>
                          <div class="error-container"
                            *ngIf="formGroup.get('loanData.typeBloanAmount')?.hasError('lessThanEqualTo')">
                            <span>{{ "loan.typeBloanAmount.error.message" | translate}}</span>
                          </div>
                        </div>
                      </div>
                      <div class="col mb-4" *ngIf="isAnyMechanismOrType()">
                        <div class="form-control-wrapper">
                          <label class="form-control-label">{{ "loan.additionalCredit.label" | translate }}</label>
                          <div class="form-control-container">
                            <input class="form-control-input" appDecimalI18n type="text"
                              formControlName="additionalCredit" />
                          </div>
                        </div>
                      </div>
                    </ng-container>
                    <div class="col mb-4">
                      <div class="form-control-wrapper" [ngClass]="{'has-error' : formGroup.get('loanData')?.hasError('feeExcess') }">
                        <label class="form-control-label">{{
                          "loan.application.fee.label" | translate
                          }}</label>
                        <div class="form-control-container">
                          <input class="form-control-input" type="text" appDecimalI18n formControlName="applicationFee" />
                          <div class="error-container"
                            *ngIf="formGroup.get('loanData.applicationFee')?.hasError('required')">
                            <span>{{ "field.requierd.error.message" | translate}}</span>
                          </div>
                          <div class="error-container" *ngIf="formGroup.get('loanData')?.hasError('feeExcess')">
                            <span>{{ "loan.applicationFee.error.message" | translate}}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div class="col mb-4">
                      <div class="form-control-wrapper">
                        <label class="form-control-label">
                          {{ "loan.freehand.label" | translate }}
                        </label>
                        <div class="form-control-container">
                          <input class="form-control-input" appNumber formControlName="freeHandFee" />
                        </div>
                      </div>
                    </div>
                    <div class="col mb-4"
                      *ngIf="!isSelectedProductIn(['ADL_SAKANE','ADL_SAKANE_PPR','IMTILAK','IMTILAK_PPR','SALAF_BAYTI_SANTE','SALAF_BAYTI_SANTE_PPR'])">
                      <div class="form-control-wrapper">
                        <label class="form-control-label">
                          <span *ngIf="(!isYassir) else yassir">  {{ "loan.deadline.number.label" | translate }}</span>
                          <ng-template #yassir> {{'loan.subvDuration.yassir.label' | translate}} </ng-template>
                        </label>
                        <div class="form-control-container">
                          <input class="form-control-input" type="text" appNumber formControlName="deadlineNumber" />
                          <div class="error-container" *ngIf="(isYassir || isPpoPpc) && deadlineNumberFormControl?.hasError('lessThanEqualTo')">
                            <span>{{ "loan.deadlineNumber.conso.max.message" | translate:{maxDeadline: isPpoPpc ? 120 : 36} }}</span>
                          </div>
                          <div class="error-container" *ngIf="formGroup.get('loanData.deadlineNumber')?.hasError('required')">
                            <span>{{ "field.requierd.error.message" | translate}}</span>
                          </div>
                          <div class="error-container" *ngIf="formGroup.get('loanData.deadlineNumber')?.hasError('sumLessThanEqualTo')">
                            <span>{{ "loan.deadlineNumber.max.message" | translate}}</span>
                          </div>
                          <div class="error-container" *ngIf="!isPpoPpcFamily && formGroup.get('loanData.deadlineNumber')?.hasError('lessThanEqualTo')">
                            <span>{{'message.deadlineNumber.'+periodicity | translate:{max:maxDeadline} }}</span>
                          </div>
                        </div>
                      </div>
                      <div class="warning-msg" *ngIf="isYassir">
                        {{ 'deadline.yassir.message' | translate }}
                      </div>
                      <div class="warning-msg" *ngIf="showRiskAgreementWarningForPpoPpc">
                           {{ "loan.deadlineNumber.riskAgreement.message" | translate }}
                      </div>
                    </div>
                    <div class="col mb-4" *ngIf="isMechanism1()">
                      <div class="form-control-wrapper" [ngClass]="{'has-error' : formGroup.get('loanData.subsidizedCreditDuration')?.hasError('lessThanEqualTo') }">
                        <label class="form-control-label">{{ "loan.subsidizedCreditDuration.label" | translate }}</label>
                        <div class="form-control-container">
                          <input class="form-control-input" appNumber formControlName="subsidizedCreditDuration" />
                        </div>
                        <div class="error-container" *ngIf="formGroup.get('loanData.subsidizedCreditDuration')?.hasError('lessThanEqualTo')">
                          {{ "loan.subsidizedCreditDuration.message" | translate}}
                        </div>
                      </div>
                    </div>
                    <div class="col mb-4" *ngIf="isMechanism2()">
                      <div class="form-control-wrapper" [ngClass]="{'has-error' : formGroup.get('loanData.bonusCreditDuration')?.hasError('lessThanEqualTo') }">
                        <label class="form-control-label">{{ "loan.bonusCreditDuration.label" | translate }}</label>
                        <div class="form-control-container">
                          <input class="form-control-input" appNumber formControlName="bonusCreditDuration" />
                        </div>
                        <div class="error-container" *ngIf="formGroup.get('loanData.bonusCreditDuration')?.hasError('lessThanEqualTo') && isSelectedProductIn(['IMTILAK','IMTILAK_PPR'])">
                          {{ "loan.bonusCreditDuration.mechanisms.max.message" | translate}}
                        </div>
                        <div class="error-container" *ngIf="formGroup.get('loanData.bonusCreditDuration')?.hasError('lessThanEqualTo') && isSelectedProductIn(['SALAF_BAYTI_SANTE','SALAF_BAYTI_SANTE_PPR'])">
                          {{ "loan.bonusCreditDuration.SalafBaytiSante.mechanisms.max.message" | translate}}
                        </div>
                      </div>
                    </div>
                    <div class="col mb-4" *ngIf="isMechanism3()">
                      <div class="form-control-wrapper" [ngClass]="{'has-error' : formGroup.get('loanData.suportedCreditDuration')?.hasError('lessThanEqualTo') }">
                        <label class="form-control-label">{{ "loan.suportedCreditDuration.label" | translate }}</label>
                        <div class="form-control-container">
                          <input class="form-control-input" appNumber formControlName="suportedCreditDuration" />
                        </div>
                        <div class="error-container" *ngIf="formGroup.get('loanData.suportedCreditDuration')?.hasError('lessThanEqualTo')">
                          {{ "loan.suportedCreditDuration.error.message" | translate}}
                        </div>
                      </div>
                    </div>
                    <div class="col mb-4" *ngIf="isTypeA()">
                      <div class="form-control-wrapper"
                        [ngClass]="{'has-error' : formGroup.get('loanData.typeAloanDuration')?.hasError('lessThanEqualTo') }">
                        <label class="form-control-label">{{ "loan.typeAloanDuration.label" | translate }}</label>
                        <div class="form-control-container">
                          <input class="form-control-input" appNumber formControlName="typeAloanDuration" />
                        </div>
                        <div class="error-container" *ngIf="formGroup.get('loanData.typeAloanDuration')?.hasError('lessThanEqualTo')">
                          {{ "loan.typeAloanDuration.error.message" | translate}}
                        </div>
                      </div>
                    </div>
                    <div class="col mb-4" *ngIf="isTypeB()">
                      <div class="form-control-wrapper" [ngClass]="{'has-error' : formGroup.get('loanData.typeBloanDuration')?.hasError('lessThanEqualTo') }">
                        <label class="form-control-label">{{ "loan.typeBloanDuration.label" | translate }}</label>
                        <div class="form-control-container">
                          <input class="form-control-input" appNumber formControlName="typeBloanDuration" />
                        </div>
                        <div class="error-container" *ngIf="formGroup.get('loanData.typeBloanDuration')?.hasError('lessThanEqualTo')">
                          {{ "loan.typeBloanDuration.error.message" | translate}}
                        </div>
                      </div>
                    </div>
                    <div class="col mb-4" *ngIf="isAnyMechanismOrType()">
                      <div class="form-control-wrapper">
                        <label class="form-control-label">{{ "loan.additionalLoanDuration.label" | translate }}</label>
                        <div class="form-control-container">
                          <input class="form-control-input" appNumber formControlName="additionalLoanDuration" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="row">
                    <div class="col-4 mb-3">
                      <label class="check-control">
                        <input type="checkbox" formControlName="delayed">
                        <div class="form-control-wrapper">
                          <span class="fake-check"></span>
                          <span class="fake-label">{{ "customer.delayed" | translate }}</span>
                        </div>
                      </label>
                    </div>
                    <div class="col mb-3" *ngIf="delayed">
                      <mat-form-field class="matselectsearch-dialog matselectsearch">
                        <mat-label class="form-control-label">{{ "customer.delay.types" | translate }}</mat-label>
                        <div class="form-control-container">
                          <mat-select [compareWith]="compareObjects" formControlName="delayType" disableOptionCentering>
                            <mat-option>
                              <ngx-mat-select-search [formControl]="delayTypeFilterControl"
                                [placeholderLabel]="'Recherche ici'"
                                [noEntriesFoundLabel]="'Aucun element correspondant trouvé'" ngDefaultControl>
                              </ngx-mat-select-search>
                              <span class="icon-search-select"></span>
                            </mat-option>
                            <mat-option *ngFor="let delay of filteredDelayTypes$ | async" [value]="delay">
                              {{ delay.designation }}
                            </mat-option>
                          </mat-select>
                          <mat-hint *ngIf="delayType?.code==='CAPITAL_INTERETS'">
                            {{"customer.delayed.capital.interet.message" | translate }}
                          </mat-hint>
                        </div>
                      </mat-form-field>
                    </div>
                    <div class="col mb-3" *ngIf="delayed">
                      <div class="form-control-wrapper" [ngClass]="{'has-error':deadlineNumberFormControl?.hasError('sumLessThanEqualTo')}">
                        <label class="form-control-label">{{ "customer.delay.duration" | translate }}</label>
                        <div class="form-control-container">
                          <input class="form-control-input" appNumber type="number" formControlName="delayDuration" min="0" />
                        </div>
                        <mat-hint *ngIf="delayDuration> 3">
                          {{"customer.delayed.duration.message" | translate }}
                        </mat-hint>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </cdk-step>
          <cdk-step *ngIf="!dossierAccordPrincipe">
            <div class="step-header">
              <div class="step-title-container">
                <div class="step-visual">
                  <img src="../../../../assets/img/steps/credit-informations.svg" width="200" alt="Données Crédit">
                </div>
                <div class="step-title-wrapper">
                  <h2 class="step-title">
                    2. {{"customer.loan.initiation.steps.loandata.label" | translate}}
                  </h2>
                  <p class="step-description">
                    {{"customer.loan.initiation.steps.loandata.text" | translate}}
                  </p>
                </div>
              </div>
            </div>
            <div class="step-form" formGroupName="loanData">
              <div class="stepper-content-body">
                <div class="step-form-container">
                  <div class="row">
                    <div class="col-12 mb-4">
                      <mat-form-field class="matselectsearch-dialog matselectsearch"
                           [ngClass]="{'disabled' :  isYassir || isPpoPpc}">
                        <mat-label class="form-control-label">{{ "loan.rate.types.label" | translate }}</mat-label>
                        <div class="form-control-container" formGroupName="rateType">
                          <mat-select formControlName="code" disableOptionCentering
                          [disabled]="isYassir || isPpoPpc">
                            <mat-option>
                              <ngx-mat-select-search [formControl]="rateTypeFilterControl"
                                [placeholderLabel]="'Recherche ici'"
                                [noEntriesFoundLabel]="'Aucun element correspondant trouvé'" ngDefaultControl>
                              </ngx-mat-select-search>
                              <span class="icon-search-select"></span>
                            </mat-option>
                            <mat-option *ngFor="let rate of filteredRateTypes$ | async" [value]="rate.code">
                              {{ rate.designation }}
                            </mat-option>
                          </mat-select>
                        </div>
                      </mat-form-field>
                    </div>
                    <div class="col mb-4" *ngIf="isMechanism1()">
                      <div class="form-control-wrapper ">
                        <label class="form-control-label">{{ "loan.subsidizedCreditRate.label" | translate }}</label>
                        <div class="form-control-container">
                          <input class="form-control-input" appDecimalI18n formControlName="subsidizedCreditRate" />
                        </div>
                      </div>
                    </div>
                    <div class="col mb-4" *ngIf="isMechanism2()">
                      <div class="form-control-wrapper">
                        <label class="form-control-label">{{ "loan.bonusCreditRate.label" | translate }}</label>
                        <div class="form-control-container">
                          <input class="form-control-input" appDecimalI18n formControlName="bonusCreditRate"
                            />
                        </div>
                      </div>
                    </div>
                    <div class="col mb-4" *ngIf="isMechanism3()">
                      <div class="form-control-wrapper">
                        <label class="form-control-label">{{ "loan.suportedCreditRate.label" | translate }}</label>
                        <div class="form-control-container">
                          <input class="form-control-input" appDecimalI18n formControlName="suportedCreditRate" />
                        </div>
                      </div>
                    </div>
                    <div class="col mb-4" *ngIf="isTypeA()">
                      <div class="form-control-wrapper">
                        <label class="form-control-label">{{ "loan.typeAloanRate.label" | translate }}</label>
                        <div class="form-control-container">
                          <input class="form-control-input" appDecimalI18n formControlName="typeAloanRate"
                          />
                        </div>
                      </div>
                    </div>
                    <div class="col mb-4" *ngIf="isTypeB()">
                      <div class="form-control-wrapper ">
                        <label class="form-control-label">{{ "loan.typeBloanRate.label" | translate }}</label>
                        <div class="form-control-container">
                          <input class="form-control-input" appDecimalI18n formControlName="typeBloanRate"
                          />
                        </div>
                      </div>
                    </div>

                    <div class="col mb-4" *ngIf="isAnyMechanismOrType()">
                      <div class="form-control-wrapper">
                        <label class="form-control-label">{{ "loan.additionalCreditRate.label" | translate }}</label>
                        <div class="form-control-container">
                          <input class="form-control-input" appNumber formControlName="additionalCreditRate" />
                        </div>
                      </div>
                    </div>
                    <div class="col mb-4"
                      *ngIf="!isSelectedProductIn(['ADL_SAKANE','ADL_SAKANE_PPR','IMTILAK','IMTILAK_PPR','SALAF_BAYTI_SANTE','SALAF_BAYTI_SANTE_PPR']) ">
                      <div class="form-control-wrapper" [ngClass]="{'disabled' : rateFormControl?.disabled}">
                        <label class="form-control-label">{{
                          "loan.rate.label" | translate
                          }}</label>
                        <div class="form-control-container">
                          <input class="form-control-input" type="text" appDecimalI18n formControlName="rate" />
                          <div class="error-container" *ngIf="formGroup.get('loanData.rate')?.hasError('required')">
                            <span>{{ "field.requierd.error.message" | translate}}</span>
                          </div>
                          <div class="error-container"
                            *ngIf="formGroup.get('loanData.rate')?.hasError('lessThanEqualTo')">
                            <span>{{ "loan.rate.error.message" | translate}}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div class="col  mb-4" *ngIf="rateTypeCodeFormControl.value === rateTypes.CAPE">
                      <div class="form-control-wrapper">
                        <label class="form-control-label">{{ "loan.capped.rate.label" | translate }}</label>
                        <div class="form-control-container">
                          <input class="form-control-input" type="text" appDecimalI18n formControlName="cappedRate" />
                          <div class="error-container" *ngIf="cappedRateFormControl?.hasError('greaterThanEqualTo')">
                            <span>{{ "loan.capped.rate.message" | translate}}</span>
                          </div>
                          <div class="error-container" *ngIf="cappedRateFormControl?.hasError('required')">
                            <span>{{ "field.requierd.error.message" | translate}}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </cdk-step>
          <cdk-step *ngIf="!dossierAccordPrincipe">
            <div class="step-header">
              <div class="step-title-container">
                <div class="step-visual">
                  <img src="../../../../assets/img/steps/credit-informations.svg" width="200" alt="Données Crédit">
                </div>
                <div class="step-title-wrapper">
                  <h2 class="step-title">
                    3. {{"customer.loan.initiation.steps.insurancedata.label" | translate}}
                  </h2>
                  <p class="step-description">
                    {{"customer.loan.initiation.steps.insurancedata.description" | translate}}
                  </p>
                </div>
              </div>
            </div>
            <div class="step-form">
              <div class="stepper-content-body">
                <div class="step-form-container">
                  <div class="row">
                    <ng-container formGroupName="insuranceData" *ngIf="!isSelectedProductIn(['ADL_SAKANE','ADL_SAKANE_PPR','IMTILAK','IMTILAK_PPR','SALAF_BAYTI_SANTE','SALAF_BAYTI_SANTE_PPR']) ; else mechanims ">
                      <div class="col-6 mb-4">
                        <div class="form-control-wrapper">
                          <label class="form-control-label">{{ 'loan.insurance.promotionalInsuranceRate.label' | translate }} (%)</label>
                          <div class="form-control-container">
                            <input class="form-control-input" type="text" appPrecision formControlName="promotionalInsuranceRate" />
                          </div>
                        </div>
                      </div>
                      <div class="col-6 mb-4">
                        <div class="form-control-wrapper" [ngClass]="{'disabled' : formGroup.get('insuranceData.insuranceCoefficient')?.disabled}">
                          <label class="form-control-label">
                            <span *ngIf="(!isYassir || !isPpoPpc) else yassir">
                              {{ 'loan.insurance.coefficient.label' | translate }}</span>
                            <ng-template #yassir> {{'loan.insurance.coefficient.annul.label'| translate}} </ng-template>
                          </label>
                          <div class="form-control-container disabled">
                            <input class="form-control-input" type="text" appPrecision formControlName="insuranceCoefficient" readOnly />
                            <div class="error-container" *ngIf="formGroup.get('insuranceData.insuranceCoefficient')?.hasError('required')">
                              <span>{{ "field.requierd.error.message" | translate}}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div class="col-6 mb-4">
                        <div class="form-control-wrapper">
                          <label class="form-control-label">{{ "loan.insurance.insuredPercentage.label" | translate }}</label>
                          <div class="form-control-container">
                            <input class="form-control-input" type="text" appDecimalI18n formControlName="insuredPercentage" />
                            <div class="error-container" *ngIf="formGroup.get('insuranceData.insuredPercentage')?.hasError('required')">
                              <span>{{ "field.requierd.error.message" | translate}}</span>
                            </div>
                            <div class="error-container" *ngIf="formGroup.get('insuranceData.insuredPercentage')?.hasError('lessThanEqualTo')">
                              <span>{{ "loan.insuredPercentage.error.message" | translate}}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </ng-container>

                    <ng-template #mechanims>
                      <ng-container formGroupName="insuranceData" *ngIf="isMechanism1()">
                        <div class="col-6 mb-4">
                          <div class="form-control-wrapper">
                            <label class="form-control-label">{{
                              'loan.insurance.subsidized.promotionalInsuranceRate.label' |
                              translate }} (%)</label>
                            <div class="form-control-container">
                              <input class="form-control-input" type="text" appPrecision
                                formControlName="subsidizedPromotionalInsuranceRate" />
                            </div>
                          </div>
                        </div>
                        <div class="col-6 mb-4">
                          <div class="form-control-wrapper">
                            <label class="form-control-label">{{ "loan.insurance.subsidized.coefficient.label" | translate }}</label>
                            <div class="form-control-container">
                              <input class="form-control-input" type="text" appPrecision formControlName="subsidizedInsuranceCoefficient" readOnly />
                              <div class="error-container" *ngIf="formGroup.get('insuranceData.subsidizedInsuranceCoefficient')?.hasError('required')">
                                <span>{{ "field.requierd.error.message" | translate}}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div class="col-6 mb-4">
                          <div class="form-control-wrapper">
                            <label class="form-control-label">{{ "loan.insurance.subsidized.insuredPercentage.label" | translate }}</label>
                            <div class="form-control-container">
                              <input class="form-control-input" type="text" appDecimalI18n formControlName="subsidizedInsuredPercentage" />
                              <div class="error-container" *ngIf="formGroup.get('insuranceData.subsidizedInsuredPercentage')?.hasError('required')">
                                <span>{{ "field.requierd.error.message" | translate}}</span>
                              </div>
                              <div class="error-container" *ngIf="formGroup.get('insuranceData.subsidizedInsuredPercentage')?.hasError('lessThanEqualTo')">
                                <span>{{ "loan.insuredPercentage.error.message" | translate}}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </ng-container>
                      <ng-container formGroupName="insuranceData" *ngIf="isMechanism2()">
                        <div class="col-6 mb-4">
                          <div class="form-control-wrapper">
                            <label class="form-control-label">{{ 'loan.insurance.bonus.promotionalInsuranceRate.label' |
                              translate }} (%)</label>
                            <div class="form-control-container">
                              <input class="form-control-input" type="text" appPrecision formControlName="bonusPromotionalInsuranceRate" />
                            </div>
                          </div>
                        </div>
                        <div class="col-6 mb-4">
                          <div class="form-control-wrapper">
                            <label class="form-control-label">{{ "loan.insurance.bonus.coefficient.label" | translate }}</label>
                            <div class="form-control-container">
                              <input class="form-control-input" type="text" appPrecision formControlName="bonusInsuranceCoefficient" readOnly />
                              <div class="error-container" *ngIf="formGroup.get('insuranceData.bonusInsuranceCoefficient')?.hasError('required')">
                                <span>{{ "field.requierd.error.message" | translate}}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div class="col-6 mb-4">
                          <div class="form-control-wrapper">
                            <label class="form-control-label">{{ "loan.insurance.bonus.insuredPercentage.label" | translate }}</label>
                            <div class="form-control-container">
                              <input class="form-control-input" type="text" appDecimalI18n formControlName="bonusInsuredPercentage" />
                              <div class="error-container" *ngIf="formGroup.get('insuranceData.bonusInsuredPercentage')?.hasError('required')">
                                <span>{{ "field.requierd.error.message" | translate}}</span>
                              </div>
                              <div class="error-container" *ngIf="formGroup.get('insuranceData.bonusInsuredPercentage')?.hasError('lessThanEqualTo')">
                                <span>{{ "loan.insuredPercentage.error.message" | translate}}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </ng-container>
                      <ng-container formGroupName="insuranceData" *ngIf="isMechanism3()">
                        <div class="col-6 mb-4">
                          <div class="form-control-wrapper">
                            <label class="form-control-label">{{ 'loan.insurance.suported.promotionalInsuranceRate.label'| translate }} (%)</label>
                            <div class="form-control-container">
                              <input class="form-control-input" type="text" appPrecision formControlName="suportedPromotionalInsuranceRate" />
                            </div>
                          </div>
                        </div>
                        <div class="col-6 mb-4">
                          <div class="form-control-wrapper">
                            <label class="form-control-label">{{ "loan.insurance.suported.coefficient.label" | translate }}</label>
                            <div class="form-control-container">
                              <input class="form-control-input" type="text" appPrecision formControlName="suportedInsuranceCoefficient" readOnly />
                              <div class="error-container" *ngIf="formGroup.get('insuranceData.suportedInsuranceCoefficient')?.hasError('required')">
                                <span>{{ "field.requierd.error.message" | translate}}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div class="col-6 mb-4">
                          <div class="form-control-wrapper">
                            <label class="form-control-label">{{ "loan.insurance.suported.insuredPercentage.label" | translate }}</label>
                            <div class="form-control-container">
                              <input class="form-control-input" type="text" appDecimalI18n formControlName="suportedInsuredPercentage" />
                              <div class="error-container" *ngIf="formGroup.get('insuranceData.suportedInsuredPercentage')?.hasError('required')">
                                <span>{{ "field.requierd.error.message" | translate}}</span>
                              </div>
                              <div class="error-container" *ngIf="formGroup.get('insuranceData.suportedInsuredPercentage')?.hasError('lessThanEqualTo')">
                                <span>{{ "loan.insuredPercentage.error.message" | translate}}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </ng-container>
                      <ng-container formGroupName="insuranceData" *ngIf="isTypeA()">
                        <div class="col-6 mb-4">
                          <div class="form-control-wrapper">
                            <label class="form-control-label">{{ 'loan.insurance.typeA.promotionalInsuranceRate.label' |
                              translate }} (%)</label>
                            <div class="form-control-container">
                              <input class="form-control-input" type="text" appPrecision
                                formControlName="typeAPromotionalInsuranceRate" />
                            </div>
                          </div>
                        </div>
                        <div class="col-6 mb-4">
                          <div class="form-control-wrapper">
                            <label class="form-control-label">{{ "loan.insurance.typeA.coefficient.label" | translate }}</label>
                            <div class="form-control-container">
                              <input class="form-control-input" type="text" appPrecision formControlName="typeAInsuranceCoefficient" readOnly />
                              <div class="error-container" *ngIf="formGroup.get('insuranceData.typeAInsuranceCoefficient')?.hasError('required')">
                                <span>{{ "field.requierd.error.message" | translate}}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div class="col-6 mb-4">
                          <div class="form-control-wrapper">
                            <label class="form-control-label">{{ "loan.insurance.typeA.insuredPercentage.label" | translate }}</label>
                            <div class="form-control-container">
                              <input class="form-control-input" type="text" appDecimalI18n formControlName="typeAInsuredPercentage" />
                              <div class="error-container" *ngIf="formGroup.get('insuranceData.typeAInsuredPercentage')?.hasError('required')">
                                <span>{{ "field.requierd.error.message" | translate}}</span>
                              </div>
                              <div class="error-container" *ngIf="formGroup.get('insuranceData.typeAInsuredPercentage')?.hasError('lessThanEqualTo')">
                                <span>{{ "loan.insuredPercentage.error.message" | translate}}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </ng-container>
                      <ng-container formGroupName="insuranceData" *ngIf="isTypeB()">
                        <div class="col-6 mb-4">
                          <div class="form-control-wrapper">
                            <label class="form-control-label">{{ 'loan.insurance.typeB.promotionalInsuranceRate.label' | translate }} (%)</label>
                            <div class="form-control-container">
                              <input class="form-control-input" type="text" appPrecision formControlName="typeBPromotionalInsuranceRate" />
                            </div>
                          </div>
                        </div>
                        <div class="col-6 mb-4">
                          <div class="form-control-wrapper">
                            <label class="form-control-label">{{ "loan.insurance.typeB.coefficient.label" | translate }}</label>
                            <div class="form-control-container">
                              <input class="form-control-input" type="text" appPrecision formControlName="typeBInsuranceCoefficient" readOnly />
                              <div class="error-container" *ngIf="formGroup.get('insuranceData.typeBInsuranceCoefficient')?.hasError('required')">
                                <span>{{ "field.requierd.error.message" | translate}}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div class="col-6 mb-4">
                          <div class="form-control-wrapper">
                            <label class="form-control-label">{{ "loan.insurance.typeB.insuredPercentage.label" | translate }}</label>
                            <div class="form-control-container">
                              <input class="form-control-input" type="text" appDecimalI18n formControlName="typeBInsuredPercentage" />
                              <div class="error-container" *ngIf="formGroup.get('insuranceData.typeBInsuredPercentage')?.hasError('required')">
                                <span>{{ "field.requierd.error.message" | translate}}</span>
                              </div>
                              <div class="error-container" *ngIf="formGroup.get('insuranceData.typeBInsuredPercentage')?.hasError('lessThanEqualTo')">
                                <span>{{ "loan.insuredPercentage.error.message" | translate}}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </ng-container>
                      <ng-container formGroupName="insuranceData" *ngIf="isTypeA() || isTypeB() || isMechanism1() || isMechanism2()">
                        <div class="col-6 mb-4">
                          <div class="form-control-wrapper">
                            <label class="form-control-label">{{ 'loan.insurance.additionalCredit.promotionalInsuranceRate.label'| translate }} (%)</label>
                            <div class="form-control-container">
                              <input class="form-control-input" type="text" appPrecision formControlName="aditionalCreditPromotionalInsuranceRate" />
                            </div>
                          </div>
                        </div>
                        <div class="col-6 mb-4">
                          <div class="form-control-wrapper">
                            <label class="form-control-label">{{ 'loan.insurance.additionalCredit.coefficient.label' | translate }}</label>
                            <div class="form-control-container">
                              <input class="form-control-input" type="text" appPrecision formControlName="aditionalCreditInsuranceCoefficient" readOnly />
                              <div class="error-container" *ngIf="formGroup.get('insuranceData.aditionalCreditInsuranceCoefficient')?.hasError('required')">
                                <span>{{ "field.requierd.error.message" | translate}}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div class="col-6 mb-4">
                          <div class="form-control-wrapper">
                            <label class="form-control-label">{{ "loan.insurance.additionalCredit.insuredPercentage.label" | translate }}</label>
                            <div class="form-control-container">
                              <input class="form-control-input" type="text" appDecimalI18n formControlName="aditionalCreditInsuredPercentage" />
                              <div class="error-container" *ngIf="formGroup.get('insuranceData.aditionalCreditInsuredPercentage')?.hasError('required')">
                                <span>{{ "field.requierd.error.message" | translate}}</span>
                              </div>
                              <div class="error-container" *ngIf="formGroup.get('insuranceData.aditionalCreditInsuredPercentage')?.hasError('lessThanEqualTo')">
                                <span>{{ "loan.insuredPercentage.error.message" | translate}}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </ng-container>
                    </ng-template>
                  </div>
                </div>
              </div>
            </div>
          </cdk-step>
          <cdk-step>
             <div class="step-form" formGroupName="propertyData">
            <div class="stepper-content-body">
              <div class="step-form-container">
                <app-loan-property-details class="property-body"
                  [beneficiaryList]="beneficiariesFormArray.value || []"
                  [propertyFormGroup]="propertyDataFormGroup"
                  [loanDataFormGroup]="loanDataFormGroup"
                  [cities$]="cities$"
                  [propertyData]="data.propertyData">
                </app-loan-property-details>
              </div>
            </div>
            </div>
          </cdk-step>
          <cdk-step>
            <div class="step-header">
              <div class="step-title-container">
                <div class="step-visual">
                  <img src="../../../../assets/img/steps/client-informations.svg" width="217" alt="Notaire" />
                </div>
                <div class="step-title-wrapper">
                  <h2 class="step-title">
                    {{ "customer.loan.initiation.steps.notary.label" | translate }}
                  </h2>
                  <p class="step-description">
                    {{ "customer.loan.initiation.steps.notary.description" | translate }}
                  </p>
                </div>
              </div>
            </div>

          <div class="step-form" formGroupName="notary">
            <div class="step-form">
              <div class="stepper-content-body">
                <div class="step-form-container">
                  <!-- Champ Nom -->
                  <div class="row">
                    <div class="col">
                      <div class="form-control-wrapper">
                        <label class="form-control-label">{{ "customer.notary.name" | translate }}</label>
                        <div class="form-control-container">
                          <input class="form-control-input" type="text" appAlphanumericInput formControlName="name" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Champ Adresse -->
                  <div class="row">
                    <div class="col">
                      <div class="form-control-wrapper">
                        <label class="form-control-label">{{ "customer.notary.address" | translate }}</label>
                        <div class="form-control-container">
                          <textarea class="form-control-textarea" formControlName="address" rows="3"></textarea>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Champ Téléphone -->
                  <div class="row">
                    <div class="col">
                      <div class="form-control-wrapper" [ngClass]="{'has-error': notaryPhoneFormControl?.errors?.pattern}">
                        <label class="form-control-label">{{ "customer.notary.phone" | translate }}</label>
                        <div class="form-control-container">
                          <input class="form-control-input" formControlName="phone" />
                        </div>
                        <div class="error-container" *ngIf="notaryPhoneFormControl?.errors?.pattern">
                          <span>{{ "customer.invalid.phone.message" | translate }}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Champ Email -->
                  <div class="row">
                    <div class="col">
                      <div class="form-control-wrapper" [ngClass]="{'has-error' : notaryMailFormControl?.errors?.email}">
                        <label class="form-control-label">{{ "customer.notary.mail" | translate }}</label>
                        <div class="form-control-container">
                          <input class="form-control-input" type="text" formControlName="email" />
                        </div>
                        <div class="error-container" *ngIf="notaryMailFormControl?.errors?.email">
                          <span>{{ "customer.notary.valid.email" | translate }}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          </cdk-step>
          <cdk-step>
            <ng-template cdkStepLabel>
              <span>
                {{ "customer.loan.initiation.steps.beneficiary.label" | translate }}
              </span>
            </ng-template>
            <app-beneficiaries-data-table
            [representativeList]="representativesFormArray.value || []"
            [beneficiaryList] = "data.beneficiaries"
            [guarantorsList] = "data.guarantors"
            [propertyData]="propertyDataFormGroup.value"
            [beneficiariesFormArray]="beneficiariesFormArray"
            [guarantorsFormArray] = "guarantorsFormArray"></app-beneficiaries-data-table>
          </cdk-step>
          <cdk-step>
              <ng-template cdkStepLabel>
                <span>
                  {{"customer.loan.initiation.steps.representative.label" | translate}}
                </span>
              </ng-template>
              <app-representatives-data-table
                      [representativesList]="data?.representatives || []"
                      [beneficiariesList]="beneficiariesFormArray.value || []"
                      [guarantorsList]="guarantorsFormArray.value || []"
                      [representativesFormArray]="representativesFormArray">
              </app-representatives-data-table>
          </cdk-step>
          <cdk-step>
            <div class="step-header">
              <div class="step-title-container">
                <div class="step-visual">
                  <img src="../../../../assets/img/steps/credit-informations.svg" width="200" alt="Données Crédit">
                </div>
                <div class="step-title-wrapper">
                  <h2 class="step-title">
                    6. {{"customer.loan.initiation.steps.guarantor.label" | translate}}
                  </h2>
                  <p class="step-description">
                    {{"customer.loan.initiation.steps.warranties.capture" | translate}}
                  </p>
                </div>
              </div>
            </div>
            <div class="step-form">
              <div class="stepper-content-body">
                <div class="step-form-container">
                  <div class="row">
                    <div class="col">
                      <div class="form-control-wrapper">
                        <span class="pb-2">{{ "loan.dossier.warraties" | translate }}</span>
                          <mat-chip-list #chipList aria-label="Warranties selection">
                            <ng-container *ngFor="let w of warranties; let i = index">
                            <mat-chip *ngIf="!!data?.isEdit && w.type !== 'TO_COLLECT' || !data?.isEdit"
                                      [selectable]="selectableWarranty"
                                      [removable]="w.type !=='AUTO' && !isCtb"
                                      (removed)="removeWarranty(i, w.type ==='AUTO')">
                              {{w.content}}
                              <button matChipRemove *ngIf="w.type !=='AUTO'&& !isCtb ">
                                <mat-icon>cancel</mat-icon>
                              </button>
                            </mat-chip>
                          </ng-container>

                          <input *ngIf="!isCtb" placeholder="{{'dialog.loan.dossier.add.warranty' | translate}}"
                            [matChipInputFor]="chipList" [matChipInputSeparatorKeyCodes]="separatorKeysCodes"
                            [matChipInputAddOnBlur]="addOnBlur" (matChipInputTokenEnd)="addWarranty($event)">
                        </mat-chip-list>

                      </div>
                    </div>
                  </div>
                <div class="row">
                  <div class="col">
                    <div class="form-control-wrapper">
                      <span class="pb-2">{{ "loan.dossier.restrictions.dsc.collection" | translate }}</span>
                      <mat-chip-list #chipList aria-label="Restrictions DSC selection">
                        <mat-chip *ngFor="let r of filterRestrictionByType(restrictions,RestrictionType.DSC); let i = index"
                                  [selectable]="selectableRestriction"
                                  [removable]="removableRestriction" (removed)="removeRestriction(r)">
                          {{r.content}}
                          <button matChipRemove *ngIf="removableRestriction">
                            <mat-icon>cancel</mat-icon>
                          </button>
                        </mat-chip>
                        <input placeholder="{{'dialog.loan.dossier.add.restriction' | translate}}"
                               [matChipInputFor]="chipList" [matChipInputSeparatorKeyCodes]="separatorKeysCodes"
                               [matChipInputAddOnBlur]="addOnBlur" (matChipInputTokenEnd)="addRestriction($event,RestrictionType.DSC)">
                      </mat-chip-list>
                    </div>
                  </div>
                </div>

                <div class="row">
                  <div class="col">
                    <div class="form-control-wrapper">
                      <span class="pb-2">{{ "loan.dossier.observations.front.collection" | translate }}</span>
                      <mat-chip-list #chipList aria-label="Observations selection">
                        <mat-chip *ngFor="let r of filterRestrictionByType(restrictions,RestrictionType.OBSERVATION); let i = index"
                                  [selectable]="selectableRestriction"
                                  [removable]="removableRestriction" (removed)="removeRestriction(r)">
                          {{r.content}}
                          <button matChipRemove *ngIf="removableRestriction">
                            <mat-icon>cancel</mat-icon>
                          </button>
                        </mat-chip>
                        <input placeholder="{{'dialog.loan.dossier.add.observation' | translate}}"
                               [matChipInputFor]="chipList" [matChipInputSeparatorKeyCodes]="separatorKeysCodes"
                               [matChipInputAddOnBlur]="addOnBlur" (matChipInputTokenEnd)="addRestriction($event,RestrictionType.OBSERVATION)">
                      </mat-chip-list>
                    </div>
                  </div>
                </div>
              </div>

              </div>
            </div>
          </cdk-step>
        </app-stepper>
      </cdk-step>

    </app-stepper>
  </form>


