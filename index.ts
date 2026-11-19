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
import { COMMA, ENTER, P } from '@angular/cdk/keycodes';
import { RateTypes } from '@core/models/rate-type';
import { MatChipInputEvent } from '@angular/material/chips';
import { NumberValidators } from '@shared/validators';
import { AccordType } from '@core/models/Accord';
import { UserService } from '@core/services/user.service';
import { Role } from '@core/constants';
import { DossierValidators } from '@loan-dossier/config/dossier-validators';
import { LoanDataCalculationService } from '@loan-dossier/services/loan-calculation.service';
import { ProductContext } from '@core/services/dossier-data-store.service';
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

  productCtx!: ProductContext;
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
  isClipriMRE: boolean = false;
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
    this.selectedProduct= this.data.product;
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
    this.selectedMechanism=this.data.loanData?.mechanisms!;
    this.isClipriMRE = ['MCH/01', 'MCH/01PRI','MCH/09PRI'].includes(personalInfo?.market);
    this.dossierAccordPrincipe = this.data?.accord === AccordType.PRINCIPE;

    // Product selection flags
    this.productCtx = this.dossierStore.productCtx as ProductContext;
    
    this.initFormGroup();
    this.initDelayedType();
    this.initDelayed();
    this.updateNotaryValidations();
    this.initClaimedAmountOfPurchaseValidators();

    this.insuranceCoefficient$.subscribe((value) => this.insuranceCoefficientFormControl?.setValue(value));
    

    if (!this.productCtx.isConventionedProducts){
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

    if (!this.productCtx.isConventionedProducts)  {
      this.loanDataFormGroup.addControl("rate", new FormControl(null, [Validators.required]));
    }

    this.notaryFeeRule = this.notaryFeeRuleConfig(this.loanObject);
    this.applyRequestedNotaryFeeValidators(this.loanObject);
    this.initDurationListeners();
    this.setupLoanCalculationListeners();
  }

  ngAfterViewInit(): void {
    this.dossierStore.update({propertyData: this.data?.propertyData});
    console.log({ data : this.data});
    
    this.formGroup.patchValue(this.data);
  }

  private applyRequestedNotaryFeeValidators(loanObjectCode: string){
    const isAQS = loanObjectCode?.includes('AQS');

    if(!this.notaryFeeRule.isEligible) {
      const isAcquisitionPriceHidden = (this.productCtx.isYassir || this.productCtx.isPpoPpc) && !isAQS;
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
    const isOptional = this.productCtx.isYassir || this.productCtx.isPpoPpc;

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
      representatives: this.formBuilder.array([])
    });


    if (!this.productCtx.isConventionedProducts) {
      this.loanDataFormGroup.addControl( 'rate', new FormControl(null, [Validators.required, NumberValidators.lessThanEqualTo({ value: 100 })]) );

      this.loanDataFormGroup.addControl(
        'deadlineNumber',
        new FormControl(null, [
          Validators.required,
          NumberValidators.sumLessThanEqualTo({ conditionalExpression: () => !this.productCtx.isPpoPpcFamily, fieldNameToAdd: 'delayDuration', value: 300 }),
          NumberValidators.lessThanEqualTo({ conditionalExpression: () => this.productCtx.isYassir, value: 36 }),
          NumberValidators.lessThanEqualTo({ conditionalExpression: () => this.productCtx.isPpoPpc, value: 120 }),
          NumberValidators.lessThanEqualTo({ conditionalExpression: () => !this.productCtx.isPpoPpcFamily && this.isItABuildingLotAcquisition(), value: this.maxDeadline })
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
    if ((!this.productCtx.isYassir && !this.productCtx.isPpoPpc) && (this.loanObject.includes('RCH') || this.loanObject.includes('AQS') || this.loanObject?.includes('REGR_CRED')  || this.loanObject?.includes('REF_ACH_BI'))) {
      this.loanDataFormGroup.addControl('claimedAmountOfPurchase', new FormControl(null, [Validators.required,  NumberValidators.lessThanEqualTo({ fieldName: 'acquisitionPrice' })]));
    }

    if (this.productCtx.isConventionedProducts) {

      this.loanDataFormGroup.addControl("additionalCredit", new FormControl());
      this.loanDataFormGroup.addControl("additionalCreditRate", new FormControl());
      this.loanDataFormGroup.addControl("additionalLoanDuration", new FormControl());

      if (this.productCtx.isAdlSakane || this.productCtx.isAdlSakanePPR ){
        this.loanDataFormGroup.addControl("typeAloanAmount", new FormControl(null, { validators: NumberValidators.lessThanEqualTo({ value: 150000 }) }));
        this.loanDataFormGroup.addControl("typeBloanAmount", new FormControl(null, { validators: NumberValidators.lessThanEqualTo({ value: 250000 }) }));
        this.loanDataFormGroup.addControl("typeAloanDuration", new FormControl(null, { validators: NumberValidators.lessThanEqualTo({ value: 120 }) }));
        this.loanDataFormGroup.addControl("typeBloanDuration", new FormControl(null, { validators: NumberValidators.lessThanEqualTo({ value: 240 }) }));
        this.loanDataFormGroup.addControl("typeAloanRate", new FormControl());
        this.loanDataFormGroup.addControl("typeBloanRate", new FormControl());

        this.loanDataFormGroup.addValidators(this.equalToMechanismSum());
      }
      if (this.productCtx.isSalafBaytiSante || this.productCtx.isSalafBaytiSantePPR) {
        this.loanDataFormGroup.addControl("bonusCreditAmount", new FormControl(null, { validators: NumberValidators.lessThanEqualTo({ value: 300000 }) }));
        this.loanDataFormGroup.addControl("bonusCreditRate", new FormControl());
        this.loanDataFormGroup.addControl("bonusCreditDuration", new FormControl(null, [
          NumberValidators.lessThanEqualTo({ conditionalExpression: () => this.isMechanism2(), value: 240, extraFieldsToUpdateValidator: ['mechanism'] }),
        ]))
        this.loanDataFormGroup.addValidators(this.equalToMechanismSum());
      }
      if (this.productCtx.isImtilak || this.productCtx.isImtilakPPR) {
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
    
    if (!this.productCtx.isPpoPpcFamily){
      this.loanDataFormGroup.addValidators([this.applicationFeesValidator])
    }
    if (this.loanObject.includes('AQS_RCH') || (this.productCtx.isPpoPpcFamily && this.isInternalRepurchaseSelected())) {
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
    if (!this.productCtx.isConventionedProducts) {
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
    if (!(this.productCtx.isImtilak || this.productCtx.isImtilakPPR)) return;
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

  public isItABuildingLotAcquisition() {
    return this.loanObject === 'AQS' &&  this.propertyType === 'TRN';
  }

  calculateApplicationFee() {
    if(this.productCtx.isPpoPpcFamily) return;
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
      control.setValue(this.toForcedNumber(this.decimalPipe.transform(savedValue, '1.4-4')));
    } else {
      computeFallback();
    }
  }

  private computeInsuranceCoefficient(promotionalRate: any, Amount: number): number | null {
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

    return this.toForcedNumber(this.decimalPipe.transform(Number(rate * 1.1 * 12), '1.4-4'));
  }

  calculateInsuranceCoefficient() {
    if(this.productCtx.isPpoPpcFamily){
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
    if(!this.productCtx.isYassir && !this.productCtx.isPpoPpc) return;

    if(this.productCtx.isYassir){
      this.setControlNumberValue(this.rateFormControl, 0);
      this.rateFormControl.disable();
    }
   
    this.loanDataFormGroup.addControl('claimedAmountOfPurchase', new FormControl(null, [
      Validators.required,  
      NumberValidators.lessThanEqualTo({ conditionalExpression: () => this.loanObject.includes('AQS'), fieldName: 'acquisitionPrice' }),
      DossierValidators.lessThanEqualToFixValue(() => this.productCtx.isYassir, this.loanDataFormGroup,  30000)
    ]));
    this.claimedAmountOfPurchaseFormControl?.updateValueAndValidity();
  }

  private initDelayedType() {
      this.delayTypes$?.subscribe();
  }

  private initDelayed() {
    this.getControlValueChanges(this.delayedFormControl).subscribe(value => {
    const isPPRProduct= this.productCtx.isImtilakPPR || this.productCtx.isAdlSakanePPR||this.productCtx.isSalafBaytiSantePPR;
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
        ? errors.map(({ controlName }) => controlName).join('\n')
        : '';

      this.showErrorMessage({ bodyKey: "Veuillez vérifier les champs " + (errorMessage || '') });
      return;
    }

    if (this.isFormValuesChanged()) {
      const emitData = {
        ...this.formGroup.getRawValue(),
        warranties: this.warranties.map(({id, type, ...rest}) => ({ ...rest, id: this.data.isEdit ? id : null, type: type === WarrantyType.TO_COLLECT ? WarrantyType.PROPOSED : type })),
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
          this.productCtx.isYassir || this.productCtx.isPpoPpc ? 0.8 : formValue.insuranceData?.insuranceCoefficient
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

  public isInternalRepurchaseSelected(): boolean {
    const value = this.loanDataFormGroup?.get('repurchaseTypes')?.value;
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
    return {
      isEligible: (isAqs || isOnlyRch) && (this.productCtx.isPPIProduct || ((this.productCtx.isPpiMRE || this.productCtx.isConventionedProducts || this.productCtx.isPPIEngagementPromoteur) && this.isClipriMRE)),
      coefficient:  isAqs ? 0.08 : 0.04
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Loan validators
  // ──────────────────────────────────────────────────────────────────────────


  private repurchasedCreditNumberValidator(): ValidatorFn {
   return (group: AbstractControl): ValidationErrors | null => {
    const fg = group as FormGroup;
    // Si pas de prêt rachat, pas de validation
    const loanObject = this.loanObject ?? '';
    const isAqsRepurchase = loanObject.includes('AQS_RCH');
    const isInternalPpoPpcRepurchase = this.productCtx.isPpoPpcFamily && this.isInternalRepurchaseSelected();
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

  // ───────────────────────────────────────────────────────────────────────────
  // Listeners for loan calculation
  // ───────────────────────────────────────────────────────────────────────────
  private setupLoanCalculationListeners() {
    const isNotaryFeesActive:boolean = this.notaryFeeRuleConfig(this.loanObject).isEligible;
    this.loanCalculationService.setupInvestmentAmount(this.loanDataFormGroup, { isNotaryFeesActive }, this.destroy$);
    this.loanCalculationService.setupLoanAmount(this.loanDataFormGroup, { isNotaryFeesActive, isPpoPpcFamily: this.productCtx.isPpoPpcFamily }, this.destroy$);
  }


  // ───────────────────────────────────────────────────────────────────────────
  // Mechanism checks
  // ──────────────────────────────────────────────────────────────────────────
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
  

  // ───────────────────────────────────────────────────────────────────────────
  // Form controls getters
  // ───────────────────────────────────────────────────────────────────────────

  
  get formGroupRawValue(): any {return this.formGroup.getRawValue();  }
  get cappedRateFormControl() {return this.formGroup.get('loanData.cappedRate') as FormControl;  }
  get applicationFeeFormControl() {return this.loanDataFormGroup.get('applicationFee') as FormControl;  }
  get insuranceCoefficientFormControl() {return this.formGroup.get('insuranceData.insuranceCoefficient') as FormControl;  }
  get aditionalCreditPromotionalInsuranceRateFormControl() {return this.formGroup.get("insuranceData.aditionalCreditPromotionalInsuranceRate") as FormControl;  }
  get aditionalCreditInsuredPercentageFormControl() {return this.formGroup.get("insuranceData.aditionalCreditInsuredPercentage") as FormControl;  }
  get aditionalCreditInsuranceCoefficientFormControl() {return this.formGroup.get("insuranceData.aditionalCreditInsuranceCoefficient") as FormControl;  }
  get subsidizedPromotionalInsuranceRateFormControl() {return this.formGroup.get("insuranceData.subsidizedPromotionalInsuranceRate") as FormControl;  }
  get bonusPromotionalInsuranceRateFormControl() {return this.formGroup.get("insuranceData.bonusPromotionalInsuranceRate") as FormControl;  }
  get suportedPromotionalInsuranceRateFormControl() {return this.formGroup.get("insuranceData.suportedPromotionalInsuranceRate") as FormControl;  }
  get subsidizedInsuranceCoefficientFormControl() {return this.formGroup.get("insuranceData.subsidizedInsuranceCoefficient") as FormControl;  }
  get bonusInsuranceCoefficientFormControl() {return this.formGroup.get("insuranceData.bonusInsuranceCoefficient") as FormControl;  }
  get suportedInsuranceCoefficientFormControl() {return this.formGroup.get("insuranceData.suportedInsuranceCoefficient") as FormControl;  }
  get subsidizedInsuredPercentageFormControl() {return this.formGroup.get("insuranceData.subsidizedInsuredPercentage") as FormControl;  }
  get bonusInsuredPercentageFormControl() {return this.formGroup.get("insuranceData.bonusInsuredPercentage") as FormControl;  }
  get suportedInsuredPercentageFormControl() {return this.formGroup.get("insuranceData.suportedInsuredPercentage") as FormControl;  }
  get typeAPromotionalInsuranceRateFormControl() {return this.formGroup.get("insuranceData.typeAPromotionalInsuranceRate") as FormControl;  }
  get typeAInsuredPercentageFormControl() {return this.formGroup.get("insuranceData.typeAInsuredPercentage") as FormControl;  }
  get typeAInsuranceCoefficientFormControl() {return this.formGroup.get("insuranceData.typeAInsuranceCoefficient") as FormControl;  }
  get typeBPromotionalInsuranceRateFormControl() {return this.formGroup.get("insuranceData.typeBPromotionalInsuranceRate") as FormControl;  }
  get typeBInsuredPercentageFormControl() {return this.formGroup.get("insuranceData.typeBInsuredPercentage") as FormControl;  }
  get typeBInsuranceCoefficientFormControl() {return this.formGroup.get("insuranceData.typeBInsuranceCoefficient") as FormControl;  }
  get deadlineNumberFormControl() {return this.loanDataFormGroup.get('deadlineNumber') as FormControl;  }
  get delayedFormControl() {return this.loanDataFormGroup.get('delayed') as FormControl;  }
  get delayDurationFormControl() {return this.loanDataFormGroup.get('delayDuration') as FormControl;  }
  get rateTypeCodeFormControl() {return this.formGroup.get('loanData.rateType.code') as FormControl;  }
  get loanDataFormGroup() {return this.formGroup.get('loanData') as FormGroup;  }
  get delayed() {return this.formGroup?.get('loanData.delayed')?.value;  }
  get acquisitionPriceFormControl() {return this.loanDataFormGroup?.get('acquisitionPrice');  }
  get delayType() {return this.formGroup?.get('loanData.delayType')?.value;  }
  get delayDuration() {return this.formGroup?.get('loanData.delayDuration')?.value;  }
  get rateFormControl() {return this.formGroup.get('loanData.rate') as FormControl;  }
  get delayTypeFormControl() {return this.formGroup?.get('loanData.delayType') as FormControl;  }
  get subsidizedCreditDurationFormControl() {return this.loanDataFormGroup.get('subsidizedCreditDuration') as FormControl;  }
  get bonusCreditDurationFormControl() {return this.loanDataFormGroup.get('bonusCreditDuration') as FormControl;  }
  get suportedCreditDurationFormControl() {return this.loanDataFormGroup.get('suportedCreditDuration') as FormControl;  }
  get additionalloanDurationFormControl() {return this.loanDataFormGroup.get('additionalLoanDuration') as FormControl;  }
  get subsidizedCreditRateFormControl() {return this.loanDataFormGroup.get('subsidizedCreditRate') as FormControl;  }
  get bonusCreditRateFormControl() {return this.loanDataFormGroup.get('bonusCreditRate') as FormControl;  }
  get suportedCreditRateFormControl() {return this.loanDataFormGroup.get('suportedCreditRate') as FormControl;  }
  get additionalCreditRateFormControl() {return this.loanDataFormGroup.get('additionalCreditRate') as FormControl;  }
  get notaryPhoneFormControl(): FormControl {return this.notaryFormGroup?.get('phone') as FormControl;  }
  get notaryMailFormControl(): FormControl {return this.notaryFormGroup?.get('email') as FormControl;  }
  get propertyDataFormGroup(): FormGroup {return this.formGroup.get('propertyData') as FormGroup;  }
  get notaryFormGroup(): FormGroup {return this.formGroup.get('notary') as FormGroup;  }
  get claimedAmountOfBuildFormControl() { return this.loanDataFormGroup.get('claimedAmountOfBuildDevelopment') as FormControl; }
  get promotionalInsuranceRateFormControl() {  return this.formGroup?.get("insuranceData.promotionalInsuranceRate") as FormControl;  }
  get claimedAmountOfPurchaseFormControl() {  return this.loanDataFormGroup.get('claimedAmountOfPurchase') as FormControl;  }
  get warrantiesFormArray(): FormArray {  return this.formGroup.controls['warranties'] as FormArray;  }
  get restrictionsFormArray(): FormArray {  return this.formGroup.controls['restrictions'] as FormArray;  }
  get beneficiariesFormArray(): FormArray {  return this.formGroup.controls['beneficiaries'] as FormArray;  }
  get guarantorsFormArray(): FormArray {  return this.formGroup.controls['guarantors'] as FormArray;  }
  get representativesFormArray(): FormArray { return this.formGroup.controls['representatives'] as FormArray;}
  get acquisitionFeeFormControl() { return this.loanDataFormGroup.get('acquisitionFee') as FormControl;}
  get requestedNotaryFeeFormControl() { return this.loanDataFormGroup?.get('requestedNotaryFee') as FormControl; }
  get showRiskAgreementWarningForPpoPpc(): boolean {
    const isTargetProduct = this.isSelectedProductIn([Products.PPO, Products.PPC]); 
    const duration = this.toForcedNumber(this.deadlineNumberFormControl?.value);
    return isTargetProduct && duration > 84;
  }

}


