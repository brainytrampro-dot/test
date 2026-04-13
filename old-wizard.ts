import { CdkStepper } from '@angular/cdk/stepper';
import { Component, EventEmitter, Injector, Input, OnInit, Output, ViewChild } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  Validators,
  ValidatorFn,
  FormArray
} from '@angular/forms';
import {
  CodeLabel,
  DelayType,
  DossierData,
  Mechanism,
  MechanismType,
  Products,
  PropertyData,
  RateType,
  RefCity,
  Warranty,
  WarrantyType,
} from '@core/models';
import { BehaviorSubject, combineLatest, Observable} from 'rxjs';
import { distinctUntilChanged, map, startWith } from 'rxjs/operators';
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
import { Status } from '@loan-dossier/constants';
import { DossierRequest } from '@core/models/dossier-request';
import { UpdateAccordComponent } from '../update-accord/update-accord.component';

@Component({
  selector: 'app-back-decsion-stepper',
  templateUrl: './back-decsion-stepper.component.html',
  styleUrls: ['./back-decsion-stepper.component.scss'],
})
export class BackToDecisionStepperComponent extends BaseComponent implements OnInit {
  dossierData!: DossierData;
  formGroup!: FormGroup;
  rateTypes = RateTypes;
  rateTypes$!: Observable<CodeLabel[]>;
  loanObject!: string;
  acquisitionPrice!: number;
  acquisitionFee!: number;
  isImtilak!: boolean;
  isImtilakPPR!: boolean;
  isSalafBaytiSante!: boolean;
  isSalafBaytiSantePPR!: boolean;
  isAdlSakane!: boolean;
  isAdlSakanePPR!: boolean;
  isPPIProduct!:boolean;
  buildDevelopmentQuotation!:number;
  selectedProduct!: CodeLabel;
  selectedMechanism: CodeLabel[]= [];
  requestedNotaryFee!:number;
  isFogarim!: boolean;
  isFogaloge!: boolean;
  isClipriMRE! : boolean;
  isYassir!:boolean;
  isPpoPpc!:boolean;
  insuranceCoefficient$: BehaviorSubject<number> = new BehaviorSubject<number>(0);
  aditionalCreditnsuranceCoefficient$: BehaviorSubject<number> = new BehaviorSubject<number>(0);
  claimedAmountOfPurchase!: number;
  claimedAmountOfBuildDevelopment!: number;

  delayTypes$?: Observable<DelayType[]>;
  valuesHasChanged: boolean = false;
  dossierData$!: Observable<DossierData>;

  @Input() data: any = {};
  @Output() returnToDecision = new EventEmitter<any>();

  @ViewChild('principalStepper') principalStepper!: CdkStepper;

  rateTypeFilterControl=new FormControl();
  delayTypeFilterControl=new FormControl();

  filteredRateTypes$?: Observable<RateType[]>;
  filteredDelayTypes$?: Observable<DelayType[]>;
  propertyType!: string;
  periodicity!:string;
  maxDeadline!:number;
  maxDeadlineValues: Map<string,number>=new Map([['MONTHLY',120],['ANNUAL',10],['BIMONTHLY',240],['QUARTERLY',40]]);
  warranties: Warranty[] = [];
  addOnBlur = true;
  removableWarranty = true;
  readonly separatorKeysCodes = [ENTER, COMMA] as const;
  selectableWarranty = true;
  private warrantiesSubject: BehaviorSubject<Warranty[]> = new BehaviorSubject<Warranty[]>([]);
  stepsVisited: boolean[] = [true, ...new Array(5).fill(false)];
  cities$?: Observable<RefCity[]>;
  accord: string | undefined;
  isProspect: boolean = false;
  propertyDataNotaryFormGroup!: FormGroup;
  dossier: any;
  isAccord: any;


  constructor(
    private dossierStore: DossierDataStoreService,
    public dossierDataService: DossierDataService,
    public topVipService: TopVipService,
    public refService: ReferentialService,
    public selectService:SelectSearchService,
    public dialogMessageService: DialogMessageService,
    injector: Injector
  ) {
    super(injector);
    this.dossierData$ = this.dossierStore.dossierData$;
    this.cities$ = this.refService.getCities();
    this.delayTypes$ = this.refService.mapToCodeDesignation(this.refService.getAllDelayTypes());
  }

  ngOnInit(): void {
  this.refService.getAllPropertyTypes();
    this.loanObject = this.data.loanData.loanObject.code;
    this.acquisitionFee= this.data.loanData.acquisitionFee;
    this.acquisitionPrice= this.data.loanData.acquisitionPrice;
    this.requestedNotaryFee=this.data.loanData.requestedNotaryFee;
    this.claimedAmountOfPurchase=this.data.loanData.claimedAmountOfPurchase;
    this.claimedAmountOfBuildDevelopment= this.data.loanData.claimedAmountOfBuildDevelopment;
    this.buildDevelopmentQuotation= this.data.loanData.buildDevelopmentQuotation;
    this.propertyType = this.data.loanData?.propertyType?.code;
    this.periodicity = this.data.loanData?.periodicity?.code;
    this.propertyType=this.data.loanData?.propertyType?.code;
    this.periodicity=this.data.loanData?.periodicity?.code;
    this.warranties = this.data.warranties;
    this.maxDeadline= this.maxDeadlineValues.get(this.periodicity) || 0;
    this.rateTypes$ = this.refService.mapToCodeDesignation(this.refService.getAllRateTypes());
    this.selectedProduct= this.data.product;
    this.selectedMechanism=this.data.loanData?.mechanisms!;
    this.isClipriMRE= this.data.personalInfo?.market === "MCH/01PRI";
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
    this.isAccord = this.data?.accord;
    this.initFormGroup();
    this.initDelayedType();
    this.initDelayed();
     this.updateNotaryValidations();
    this.formGroup.patchValue(this.data);
    this.insuranceCoefficient$.subscribe((value) => this.insuranceCoefficientFormControl?.setValue(value));
   if(this.isYassir || this.isPpoPpc){
      this.initClaimedAmountOfPurchaseValidators();
   }

    if (!this.isSelectedProductIn([Products.ADL_SAKANE,Products.ADL_SAKANE_PPR,Products.IMTILAK,Products.IMTILAK_PPR,Products.SALAF_BAYTI_SANTE,Products.SALAF_BAYTI_SANTE_PPR]) ){
      this.initCappedRateValidators();
      if(this.data?.insuranceData?.insuranceCoefficient) {
      const coefficient = this.decimalPipe.transform(this.data?.insuranceData?.insuranceCoefficient,'1.4-4');
      this.insuranceCoefficientFormControl.setValue(coefficient);
      }
      }

      if (this.isMechanism1()) {
          const coefficient = this.decimalPipe.transform(this.data?.insuranceData?.subsidizedInsuranceCoefficient,'1.4-4');
          this.subsidizedInsuranceCoefficientFormControl.setValue(coefficient);
      }
      if (this.isMechanism2()) {
          const coefficient = this.decimalPipe.transform(this.data?.insuranceData?.bonusInsuranceCoefficient,'1.4-4')
          this.bonusInsuranceCoefficientFormControl.setValue(coefficient);
      }
      if (this.isMechanism3()) {
          const coefficient = this.decimalPipe.transform(this.data?.insuranceData?.suportedInsuranceCoefficient,'1.4-4');
          this.suportedInsuranceCoefficientFormControl.setValue(coefficient);
      }

      if (this.isTypeA()) {
          const coefficient = this.decimalPipe.transform(this.data?.insuranceData?.typeAInsuranceCoefficient,'1.4-4');
          this.typeAInsuranceCoefficientFormControl.setValue(coefficient);
      }
      if (this.isTypeB()) {
          const coefficient = this.decimalPipe.transform(this.data?.insuranceData?.typeBInsuranceCoefficient,'1.4-4');
          this.typeBInsuranceCoefficientFormControl.setValue(coefficient);
      }

      if (this.isTypeB() || this.isTypeA() ||this.isMechanism1() ||this.isMechanism2() ) {
        const coefficient = this.decimalPipe.transform(this.data?.insuranceData?.aditionalCreditInsuranceCoefficient,'1.4-4');
        this.aditionalCreditInsuranceCoefficientFormControl.setValue(coefficient);
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
      this.warrantiesSubject.subscribe(() => {
        this.isWarrantiesChange();
      });
     if(this.isPPIProduct || this.isClipriMRE){
        this.acquisitionPriceFormControl?.clearValidators();
        this.acquisitionPriceFormControl?.addValidators([Validators.required,  NumberValidators.sumPercentLessThanEqualTo({ fieldNameCoefficient: 0.08, fieldName: 'requestedNotaryFee' })]);
        this.acquisitionPriceFormControl?.updateValueAndValidity();
      }
      if (!this.isImtilak && !this.isImtilakPPR && !this.isAdlSakane && !this.isAdlSakanePPR && !this.isSalafBaytiSante && !this.isSalafBaytiSantePPR)  {
        this.loanDataFormGroup.addControl("rate", new FormControl(null, [Validators.required]));
      }

      this.initDurationListeners();
  }

  isAnyMechanismOrType(): boolean {
    return this.isTypeA() || this.isTypeB() || this.isMechanism1() || this.isMechanism2();
  }

  public isSelectedProductIn(productsCode: string[]) {
    return productsCode.includes(this.selectedProduct?.code) ;
  }

  lessThanEqualToFixValue(max:number): ValidatorFn {
    return (control: AbstractControl): { [key: string]: any } | null => {
      const loanAmount = this.claimedAmountOfPurchaseFormControl?.value;
      return !loanAmount || loanAmount<=max ? null : { lessThanEqualToFixedValue: true }; 
    };
  }

  nextStep = () => {
      this.principalStepper.next();
  }

  previousStep = () => {
    this.principalStepper.previous();
  }

  doneStepper = () => {
    this.onValidate();
  };

  previousStepper = () => {
    this.principalStepper.previous();
  }


  public isSelectedProduct(productCode: string) {
    return this.selectedProduct?.code === productCode;
  }

  validateForm(){
    return !this.valuesHasChanged || !(this.formGroup.valid && this.valuesHasChanged)
  }

  initFormGroup() {
    this.formGroup = this.formBuilder.group({
      propertyData: this.formBuilder.group({
        properties: this.formBuilder.array([], this.minLengthArray(1)),
        coFinancing: new FormControl()
      }),
      notary: this.formBuilder.group({
        name: new FormControl(null, [Validators.required]),
        address: new FormControl(null, [Validators.required]),
        phone: new FormControl(null, [Validators.required, Validators.pattern('^(0[0-9]{9}|\\+?[1-9]\\d{1,14})$')]),
        email: new FormControl(null, [Validators.required, Validators.email])
      }),
      loanData: this.formBuilder.group({
        rateType: this.formBuilder.group({
          code: new FormControl(null, [Validators.required]),
        }),
        cappedRate: new FormControl(null),
        delayed: new FormControl(false, ...(this.data?.loanData?.delayed ? [Validators.required] : [])),
        delayType: new FormControl(),
        delayDuration: new FormControl()
      }),
      insuranceData: this.formBuilder.group({}),
      beneficiaries: this.formBuilder.array([], this.minLengthArray(1)),
      warranties: this.formBuilder.array([], this.minLengthArray(1)),
    });


    if (!this.isSelectedProductIn([Products.ADL_SAKANE,Products.ADL_SAKANE_PPR,Products.IMTILAK,Products.IMTILAK_PPR,Products.SALAF_BAYTI_SANTE,Products.SALAF_BAYTI_SANTE_PPR])) {
      this.loanDataFormGroup.addControl(
        'rate',
        new FormControl(null, [Validators.required, NumberValidators.lessThanEqualTo({ value: 100 })])
      );

      this.loanDataFormGroup.addControl(
        'deadlineNumber',
        new FormControl(null, [
          Validators.required,
          NumberValidators.sumLessThanEqualTo({ fieldNameToAdd: 'delayDuration', value: 300 }),
          NumberValidators.lessThanEqualTo({ conditionalExpression: () => this.isYasserProduct() || this.isPpoPpcProduct(), value: 36 }),
          NumberValidators.lessThanEqualTo({ conditionalExpression: () => this.isItABuildingLotAcquisition(), value: this.maxDeadline })
        ])
      );
    }

    if (this.loanObject.includes('AMN') || this.loanObject.includes('CST')) {
      this.loanDataFormGroup.addControl('claimedAmountOfBuildDevelopment', new FormControl(null, [Validators.required, NumberValidators.lessThanEqualTo({ value: this.buildDevelopmentQuotation})]));
     }
    if (this.loanObject.includes('RCH') || this.loanObject.includes('AQS') || this.isYassir || this.isPpoPpc) {
      this.loanDataFormGroup.addControl('claimedAmountOfPurchase', new FormControl(null, [Validators.required, NumberValidators.lessThanEqualTo({ value : (NumberUtils.toForcedNumber(this.acquisitionFee)+NumberUtils.toForcedNumber(this.acquisitionPrice))})]));
    }
    if(!this.isFogarim && !this.isFogaloge && (this.isPPIProduct || this.isClipriMRE)){
      this.loanDataFormGroup.addControl('requestedNotaryFee', new FormControl(null, [Validators.required, NumberValidators.lessThanEqualTo({ value : (NumberUtils.toForcedNumber(this.acquisitionPrice) * 0.08)})]));

    }
    if(!this.isFogarim && !this.isFogaloge && (this.isPPIProduct || this.isClipriMRE)){
      this.loanDataFormGroup.addControl('requestedNotaryFee', new FormControl(null, [Validators.required, NumberValidators.lessThanEqualTo({ value : (NumberUtils.toForcedNumber(this.acquisitionPrice) * 0.01)})]));

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

      this.loanDataFormGroup.addValidators(this.sumLoanAmountsValidator.bind(this));
      }
      if (this.isSalafBaytiSante || this.isSalafBaytiSantePPR) {
        this.loanDataFormGroup.addControl("bonusCreditAmount", new FormControl(null, { validators: NumberValidators.lessThanEqualTo({ value: 300000 }) }));
        this.loanDataFormGroup.addControl("bonusCreditRate", new FormControl());
        this.loanDataFormGroup.addControl("bonusCreditDuration", new FormControl(null, [Validators.required,
          NumberValidators.lessThanEqualTo({ conditionalExpression: () => this.isMechanism2(), value: 240, extraFieldsToUpdateValidator: ['mechanism'] }),
        ]))
        this.loanDataFormGroup.addValidators(this.sumCreditAmountsValidator.bind(this));
      }
      if (this.isImtilak || this.isImtilakPPR) {
        this.loanDataFormGroup.addControl("subsidizedCreditAmount", new FormControl(null, { validators: NumberValidators.lessThanEqualTo({ value: 300000 }) }));
        this.loanDataFormGroup.addControl("bonusCreditAmount", new FormControl(null, { validators: NumberValidators.lessThanEqualTo({ value: 200000 }) }));
        this.loanDataFormGroup.addControl("suportedCreditAmount", new FormControl());
        this.loanDataFormGroup.addControl("subsidizedCreditRate", new FormControl());
        this.loanDataFormGroup.addControl("bonusCreditRate", new FormControl());
        this.loanDataFormGroup.addControl("suportedCreditRate", new FormControl());
        this.loanDataFormGroup.addControl("subsidizedCreditDuration", new FormControl());
        this.loanDataFormGroup.addControl("bonusCreditDuration", new FormControl(null, [Validators.required,
          NumberValidators.lessThanEqualTo({ conditionalExpression: () => this.isMechanism2(), value: 180, extraFieldsToUpdateValidator: ['mechanism'] }),
        ]))
        this.loanDataFormGroup.addControl("suportedCreditDuration", new FormControl());

        this.loanDataFormGroup.addValidators(this.sumCreditAmountsValidator.bind(this));
      }

    }
    
    this.initInsuranceDataForm()

    this.loanDataFormGroup.addControl("applicationFee", new FormControl(null, [Validators.required]));
    this.loanDataFormGroup.addValidators([this.applicationFeesValidator])

    if(!this.isFogarim && !this.isFogaloge && (this.isPPIProduct || this.isClipriMRE)){
      this.loanDataFormGroup.addControl("acquisitionFee", new FormControl());
      this.loanDataFormGroup.addControl('requestedNotaryFee', new FormControl(null, [Validators.required, NumberValidators.lessThanEqualTo({ value : (NumberUtils.toForcedNumber(this.acquisitionPrice) * 0.08)})]));
    }
    if(this.isYassir || this.isPpoPpc){
      this.setControlNumberValue(this.rateFormControl, 0);
      this.rateFormControl.disable();
      this.insuranceCoefficientFormControl.disable();
    }
    /** for regrouping notary & propertyData only in front presentation**/
    this.propertyDataNotaryFormGroup = this.formBuilder.group({});
    this.propertyDataNotaryFormGroup.addControl('notary', this.formGroup.get('notary') as FormGroup);
  }

  private minLengthArray(min: number): ValidatorFn {
    return (control: AbstractControl): {[key: string]: any} | null => {
      if(control.value && control.value.length >= min){
        return null;
      }
      return { minLengthArray: { valid: false, requiredLength: min, actualLength: control.value.length}};
    }
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
        insuranceDataFormGroup.addControl("aditionalCreditInsuredPercentage", new FormControl('', [Validators.required, NumberValidators.lessThanEqualTo({ value: 100 })]));
        insuranceDataFormGroup.addControl("aditionalCreditPromotionalInsuranceRate", new FormControl());
        insuranceDataFormGroup.addControl("aditionalCreditInsuranceCoefficient", new FormControl(null, [Validators.required]));

    }
  }

  private sumLoanAmountsValidator(control: AbstractControl): { [key: string]: any } | null {
    const typeAloanAmount = Number(control.get('typeAloanAmount')?.value) || 0;
    const typeBloanAmount = Number(control.get('typeBloanAmount')?.value) || 0;
    const additionalCredit = Number(control.get('additionalCredit')?.value) || 0;

    const total = typeAloanAmount + typeBloanAmount + additionalCredit;
    const maxAmount = Number(this.data?.loanData?.loanAmount);

    if (!isNaN(maxAmount) && total > maxAmount) {
      return { sumExceedsLoanAmount: true };
    }
    return null;
  }

  private sumCreditAmountsValidator(control: AbstractControl): { [key: string]: any } | null {
    const subsidizedCreditAmount = Number(control.get('subsidizedCreditAmount')?.value) || 0;
    const bonusCreditAmount = Number(control.get('bonusCreditAmount')?.value) || 0;
    const suportedCreditAmount = Number(control.get('suportedCreditAmount')?.value) || 0;
    const additionalCredit = Number(control.get('additionalCredit')?.value) || 0;

    const total = subsidizedCreditAmount + bonusCreditAmount +suportedCreditAmount+ additionalCredit;
    const maxAmount = Number(this.data?.loanData?.loanAmount);

    if (!isNaN(maxAmount) && total > maxAmount) {
      return { sumExceedsLoanAmount: true };
    }
    return null;
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

  isWarrantiesChange() {
    const { warranties } = this.data;
    const warrantiesChanged = ObjectUtils.compareByField(this.warranties, warranties,'content');
    this.valuesHasChanged =warrantiesChanged;
  }

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
        this.setControlNumberValue(this.subsidizedCreditRateFormControl, subRate!);
        this.setControlNumberValue(this.additionalCreditRateFormControl, addRate!);
        this.setControlNumberValue(this.suportedCreditRateFormControl, supRate!);
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
    const claimedAmountOfPurchase = this.loanDataFormGroup.get('claimedAmountOfPurchase');
    const claimedAmountOfBuildDevelopment = this.loanDataFormGroup.get('claimedAmountOfBuildDevelopment');
    const requestedNotaryFee = this.loanDataFormGroup.get('requestedNotaryFee');

    let sum = 0;
    if(claimedAmountOfPurchase?.value && !this.isPpoPpc){
      sum += claimedAmountOfPurchase?.value;
    }
    if(claimedAmountOfBuildDevelopment?.value && !this.isPpoPpc){
      sum += claimedAmountOfBuildDevelopment?.value;
    }
    if(requestedNotaryFee?.value && !this.isPpoPpc){
      sum += requestedNotaryFee?.value;
    }

    this.applicationFeeFormControl?.patchValue(NumberUtils.round(sum/1000, 2));
  }


  private computeInsuranceCoefficient(promotionalRate: any, Amount: number): string | null {
    if(this.isYassir || this.isPpoPpc) return this.decimalPipe.transform(0.8, '1.4-4');
    Amount = NumberUtils.toForcedNumber(Amount);
    if (Amount <= 0) {
      return null;
    }

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
    if(this.isYassir || this.isPpoPpc){
      this.insuranceCoefficientFormControl.setValue(0.8);
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
    this.claimedAmountOfPurchaseFormControl.clearValidators();
    if(this.isYassir){
    this.claimedAmountOfPurchaseFormControl?.addValidators([Validators.required,this.lessThanEqualToFixValue(30000)]);}

    if(this.loanObject.includes('AQS') && this.isYassir){
      this.claimedAmountOfPurchaseFormControl?.addValidators(
        [NumberValidators.lessThanEqualTo({ value : (NumberUtils.toForcedNumber(this.acquisitionFee)+NumberUtils.toForcedNumber(this.acquisitionPrice))})]);
      }

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

  onValidate() {
    if(this.formGroup.valid && this.valuesHasChanged){
      const emitData = {
        ...this.formGroup.getRawValue(),
        warranties: this.warranties.map(({content})=> ({content, type: WarrantyType.PROPOSED}))
    };
      this.returnToDecision.emit(emitData);

    }else{
      this.showErrorMessage({bodyKey: "action.error.message"});
    }
  }

  addWarranty(event: MatChipInputEvent): void {
    const value = (event.value || '').trim();
    if (value && value.trim() !== '') {
      const warranty: Warranty = {
        content: value
      };
      this.warranties.push(warranty);
      this.warranties = [...new Set(this.warranties.map(w => JSON.stringify(w)))].map(w => JSON.parse(w));
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


  isFormValuesChanged(): boolean {
    const {loanData, insuranceData, propertyData} = this.data;
    let newFormObject: any = {};
    newFormObject={...this.formGroup.value,
      insuranceData:  {...this.formGroup.value.insuranceData ,
        insuranceCoefficient: NumberUtils.toForcedNumber((this.isYassir || this.isPpoPpc)?0.8:this.formGroup.value.insuranceData?.insuranceCoefficient ),

        subsidizedInsuranceCoefficient: NumberUtils.toForcedNumber(this.formGroup.value.insuranceData?.subsidizedInsuranceCoefficient ),
        bonusInsuranceCoefficient: NumberUtils.toForcedNumber(this.formGroup.value.insuranceData?.bonusInsuranceCoefficient ),
        suportedInsuranceCoefficient: NumberUtils.toForcedNumber(this.formGroup.value.insuranceData?.suportedInsuranceCoefficient ),

        typeAInsuranceCoefficient: NumberUtils.toForcedNumber(this.formGroup.value.insuranceData?.typeAInsuranceCoefficient),
        typeBInsuranceCoefficient: NumberUtils.toForcedNumber(this.formGroup.value.insuranceData?.typeBInsuranceCoefficient),
        aditionalCreditInsuranceCoefficient: NumberUtils.toForcedNumber(this.formGroup.value.insuranceData?.aditionalCreditInsuranceCoefficient),
      },
    };
    return ObjectUtils.compareProperties(newFormObject, { loanData, insuranceData, propertyData });

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
    this.accord = dossier?.accord;
    this.isProspect = !!dossier?.customerData?.personalInfo?.prospect;
    const product = dossier.product?.code

    const allowedCodesByField: Record<typeof fileds, string[]> = {
      Notary: [Products.MOULKIA.toString(), Products.PPI_VEFA.toString(), Products.YASSIR.toString(), Products.YASSIR_PPR.toString(), Products.PPO.toString(), Products.PPO_PPR.toString(), Products.PPC.toString(),]
    };

    return (
      this.accord === AccordType.PRINCIPE ||
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
  get promotionalInsuranceRateFormControl() {
    return this.formGroup?.get("insuranceData.promotionalInsuranceRate") as FormControl;
  }
  get claimedAmountOfPurchaseFormControl() {
    return this.loanDataFormGroup.get('claimedAmountOfPurchase') as FormControl;
  }

  get warrantiesFormArray(): FormArray {
    return this.formGroup.controls['warranties'] as FormArray;
  }

  get beneficiariesFormArray(): FormArray {
    return this.formGroup.controls['beneficiaries'] as FormArray;
  }
}


