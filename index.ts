import { AfterViewInit, ChangeDetectionStrategy, Component, Injector, Input, OnDestroy, OnInit, Optional } from '@angular/core';
import { FormControl, FormGroup, Validators, ValidatorFn, ValidationErrors } from '@angular/forms';
import { CCGCommissionChargeType, CodeLabel, DossierData, LoanObject, Mechanism, MechanismType, Products, PropertyType, RateNature, RateType } from '@core/models';
import { BaseComponent } from '@shared/components';
import { BehaviorSubject, EMPTY, Observable, Subject, combineLatest, merge, of } from 'rxjs';
import { RateTypes } from '@core/models/rate-type';
import { DossierDataService, DossierDataStoreService, ReferentialService } from '@core/services';
import { DelayType } from '@core/models/delay-type';
import { debounceTime, distinctUntilChanged, filter, map, pairwise, startWith, takeUntil, take, tap } from 'rxjs/operators';
import { ErrorStateMatcher, ShowOnDirtyErrorStateMatcher } from '@angular/material/core';
import { TopVipService } from '@loan-dossier/services';
import { NumberUtils } from '@core/util/number-utils';
import { CdkStepper } from '@angular/cdk/stepper';
import { InitiationStepperComponent } from '../initiation-stepper/initiation-stepper.component';
import { animate, style, transition, trigger } from '@angular/animations';
import { DialogConfirmationService, NumberValidators} from '@octroi-credit-common';
import { AbstractControl } from '@angular/forms';
import { SelectSearchService } from '@loan-dossier/services/select.service';
import * as moment from 'moment';
import { CcgCommessionMatrix } from '@core/models/ccg-commession-matrix';

@Component({
  selector: 'app-customer-loan-data-form',
  templateUrl: './customer-loan-data-form.component.html',
  styleUrls: ['./customer-loan-data-form.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: ErrorStateMatcher, useClass: ShowOnDirtyErrorStateMatcher }
  ],
  animations: [
    trigger('scaleInOut',
      [
        transition(':enter', [
          style({
            transform: 'scale(0)', opacity: 0
          }),
          animate('100ms', style({ transform: 'scale(1)', opacity: 1 })),
        ]),
        transition(':leave', [
          animate('100ms', style({
            transform: 'scale(0)', opacity: 0
          }))
        ])
      ])
  ]
})
export class CustomerLoanDataFormComponent extends BaseComponent implements OnInit, OnDestroy {
  @Input() loanDataFormGroup!: FormGroup;
  dossierData: DossierData | undefined;
  rateTypes$?: Observable<RateType[]>;
  rateNatures$?: Observable<RateNature[]>;
  delayTypes$?: Observable<DelayType[]>;
  propertyTypes$!: Observable<PropertyType[]>;
  mechanisms$!: Observable<Mechanism[]>;
  loanObjects$!: Observable<LoanObject[]>;
  mechanisms= MechanismType;
  ccgCommissionChargeType$!: Observable<CCGCommissionChargeType[]>;
  filteredCcgCommissionChargeType$!: Observable<CCGCommissionChargeType[]>;
  rateTypesEnum!: string[];
  investmentAmount$: BehaviorSubject<number> = new BehaviorSubject<number>(0);
  isImtilak!: boolean;
  isImtilakPPR!: boolean;
  isFogarim!: boolean;
  isFogaloge!: boolean;
  isAdlSakane!: boolean;
  isAdlSakanePPR!: boolean;
  isSalafBaytiSante!: boolean;
  isSalafBaytiSantePPR!: boolean;
  isVeFa!:boolean;
  isPPIEngagementPromoteur!:boolean; 
  isMoulkia!:boolean;
  isPpiMRE!:boolean;
  selectedProduct!: CodeLabel;
  mechanismPreviousValues = [];
  rateTypes = RateTypes;
  repurchaseTypes$!: Observable<CodeLabel[]>;
  repurchaseTypes!: CodeLabel[];
  periodicities$!: Observable<CodeLabel[]>;
  isPPIProduct!:boolean;
  isClipriMRE!:boolean;
  customerType!: string;
  isProspect!:boolean;
  isAccordPrincipe!:boolean;
  selectedMechanism: CodeLabel[]= [];
  periodicityFilterControl=new FormControl();
  rateTypeFilterControl=new FormControl();
  rateNatureFilterControl=new FormControl();
  delayTypeFilterControl=new FormControl();
  loanObjectFilterControl=new FormControl();
  propertyTypeFilterControl=new FormControl();
  mechanismFilterControl=new FormControl();
  ccgCommissionChargeTypeFilterControl=new FormControl();
  mechanismsFilterControl=new FormControl();
  filteredPeriodicities$!: Observable< CodeLabel[]>;
  filteredMechanisms$!: Observable< CodeLabel[]>;
  filteredRateTypes$?: Observable<RateType[]>;
  filteredRateNatures$?: Observable<RateNature[]>;
  filteredDelayTypes$?: Observable<DelayType[]>;
  filteredLoanObjects$?: Observable<DelayType[]>;
  filteredPropertyTypes$?: Observable<DelayType[]>;
  isPatrimonial: boolean = false;
  isHautDeGamme: boolean = false;
  private destroy$ = new Subject<void>();

  constructor(injector: Injector, public dossierStore: DossierDataStoreService,
              private dossierDataService: DossierDataService,
              private topVipService: TopVipService,
              public refService: ReferentialService, private  selectService:SelectSearchService,
              private cdkStepper: CdkStepper, @Optional() private parent: InitiationStepperComponent,private dialogConfirmationService:DialogConfirmationService) {
    super(injector);
    this.rateTypesEnum = Object.keys(RateTypes);
    this.rateTypes$ = this.refService.mapToCodeDesignation(this.refService.getAllRateTypes());
    this.rateNatures$ = this.refService.mapToCodeDesignation(this.refService.getAllRateNatures());
    this.delayTypes$ = this.refService.mapToCodeDesignation(this.refService.getAllDelayTypes());
    this.propertyTypes$ = this.refService.propertyTypesSubjet$;
    this.ccgCommissionChargeType$ = this.refService.mapToCodeDesignation(this.refService.getAllCCGCommissionChargeTypes());
    this.repurchaseTypes$ = this.refService.getAllRepurchaseTypes();
    this.periodicities$ = this.refService.getPeriodicities();
  }

  ngOnInit(): void {
    const dossier = this.dossierStore.get();
    this.selectedProduct = dossier.product!;
    this.isPatrimonial = !!dossier?.customerData?.personalInfo?.market?.includes('09');
    this.isHautDeGamme = !!dossier?.customerData?.personalInfo?.segment?.toLowerCase()?.includes('haut de gamme');
    this.initDossierForm(dossier);
    this.initLoanDataForm();
    this.initMechanismsControls();
    this.initCcgCommissionChargeTypeControls();
    this.initRateType();
    this.initDelayed();
    this.initRateNature();
    this.initDurationListeners();    
    this.loanObjects$ = this.refService.getAllLoanObjects().pipe(
      map(list => list.filter(item => item?.products?.some(p => p.code === this.selectedProduct?.code))
        .map(({ code, designation }) => ({ code, designation }))
    ));
    this.filteredLoanObjects$ = this.selectService.filterOptions(this.loanObjects$, this.loanObjectFilterControl, 'designation');
    this.filteredPeriodicities$= this.selectService.filterOptions(this.periodicities$ || of([]),this.periodicityFilterControl,'designation');
    this.filteredRateTypes$= this.selectService.filterOptions(this.rateTypes$ || of([]),this.rateTypeFilterControl,'designation');
    this.filteredRateNatures$= this.selectService.filterOptions(this.rateNatures$ || of([]),this.rateNatureFilterControl,'designation');
    this.filteredDelayTypes$= this.selectService.filterOptions(this.delayTypes$ || of([]),this.delayTypeFilterControl,'designation');
    this.filteredPropertyTypes$= this.selectService.filterOptions(this.propertyTypes$ || of([]),this.propertyTypeFilterControl,'designation');
    this.filteredCcgCommissionChargeType$= this.selectService.filterOptions(this.ccgCommissionChargeType$ || of([]),this.ccgCommissionChargeTypeFilterControl,'designation');
    this.mechanisms$ = this.refService.mapToCodeDesignation(this.refService.getProductByCode(this.selectedProduct?.code).pipe(map(({ mechanisms }) => mechanisms)));
    this.filteredMechanisms$ = this.selectService.filterOptions(this.mechanisms$, this.mechanismFilterControl, 'designation');
    
    this.onChangeCustomerType(dossier);
    this.onChangeMechanisms();
    this.onChangeLoanObject();
    this.onChangePeriodicity();
    this.calculateInvestmentAmount();
    this.calculateLoanAmount();
    this.calculateApport();
    this.calculatePercentOfApport();
    this.calculateSocialHousing();
    this.calculateMonthlyCoefficient();
    this.validateAmounts(); 
    this.onInitSalafBaytiSanteValues();  

    if (this.isFogaloge || this.isFogarim || this.isImtilak || this.isImtilakPPR|| this.isAdlSakane|| this.isAdlSakanePPR||this.isSalafBaytiSante||this.isSalafBaytiSantePPR) {
      this.setFormControlValueAndDisable(this.periodicities$, this.periodicityFormControl, "MONTHLY");
    }
    if (this.isSalafBaytiSante || this.isSalafBaytiSantePPR) {
      this.setFormControlValueAndDisable(this.mechanisms$, this.mechanismFormControl, "MCN2");
    }
    this.loanDataFormGroup.setValidators([ this.loanAmountGroupValidator(),this.repurchasedCreditNumberValidator() ]);
    this.loanDataFormGroup.updateValueAndValidity();
    this.forceRepurchaseTypeINTForSpecificLoanObjects();
    this.confirmResetRepurchasedCreditNumberOnLoanObjectChange();
  }


  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  firstDueDateFilter = (d: Date | null): boolean => {
    if(!d) return false;
    const date = moment(d).toDate();
    const day = date.getDate();
    const month = date.getMonth();
    const year = date.getFullYear();
    const lastDay  = new Date(year, month + 1, 0).getDate();

    return (day >= 1 && day <= 5 ) || (day >= 25 && day <= lastDay);
  }

  nextStep = () => {    
    if(this.loanDataFormGroup.hasError('maxAmount')){
      this.showErrorMessage({bodyKey: "loan.total.installments.message"});
    }
    else{
      this.dossierStore.update({
        loanData: {...this.loanDataFormGroup.getRawValue()},
        ccgCommessionMatrix: this.dossierStore.get()?.ccgCommessionMatrix
      });
    }
  }

  doneStepper = () => {
    this.cdkStepper.next();
  };

  previousStepper = () => {
    this.cdkStepper.previous();
  }

  compareObjects(o1: any, o2: any): boolean {
    return o1?.code === o2?.code
  }

  isStepValid(formGroup: AbstractControl) {
    return !this.isFormHasFunctionalErrors(formGroup as FormGroup);
  }

  private applyRequestedNotaryFeeValidators(loanObjectCode: string){
    const isAQS = loanObjectCode?.includes('AQS');
    const isOnlyRCH = loanObjectCode?.includes('RCH') && !loanObjectCode?.includes('AQS');
    const isElligibleForNotaryFee = (isAQS || isOnlyRCH) && (this.isPPIProduct || (this.isPpiMRE && this.isClipriMRE));

    if(!isElligibleForNotaryFee) {
      this.acquisitionFeeFormControl?.reset(null, { emitEvent: true });
      this.requestedNotaryFeeFormControl?.reset(null, { emitEvent: true });
      this.acquisitionFeeFormControl?.clearValidators();
      this.requestedNotaryFeeFormControl?.clearValidators();
      this.acquisitionPriceFormControl?.clearValidators();
      this.acquisitionPriceFormControl?.addValidators([Validators.required]);
      this.acquisitionPriceFormControl?.updateValueAndValidity();
      this.acquisitionFeeFormControl?.updateValueAndValidity();
      this.requestedNotaryFeeFormControl?.updateValueAndValidity();
      return;
    }

    const coefficient = isAQS ? 0.08 : 0.04;
    this.acquisitionFeeFormControl.addValidators([Validators.required]);
    this.requestedNotaryFeeFormControl?.addValidators([Validators.required, NumberValidators.lessThanEqualTo({ fieldName:  'acquisitionFee' })]);
    this.acquisitionPriceFormControl?.clearValidators();
    this.acquisitionPriceFormControl?.addValidators([
      Validators.required,  
      NumberValidators.sumPercentLessThanEqualTo({ fieldNameCoefficient: coefficient, fieldName: 'requestedNotaryFee' })
    ]);
    this.acquisitionPriceFormControl?.updateValueAndValidity();
    this.requestedNotaryFeeFormControl?.updateValueAndValidity();
  }

  private onChangeCustomerType(dossier: DossierData){
    const personalInfo = dossier.customerData?.personalInfo;
    this.dossierStore.typeClient$.subscribe(value=>{
      const isClipri = value==='CLIPRI' && ['MCH/01', 'MCH/01PRI', 'MCH/09PRI'].includes(personalInfo?.market!);
      if( (this.isPpiMRE && isClipri) || this.isPPIProduct){
        this.isClipriMRE = !!isClipri;
        this.applyRequestedNotaryFeeValidators(this.loanObjectFormControl?.value?.code);
        this.calculateInvestmentAmount();
        this.calculateLoanAmount();
        this.changeDetectorRef.detectChanges();
        return;
      }
      
      if(value === "CLIPRO" && !this.isClipriMRE){        
        this.isClipriMRE = false;
        this.acquisitionPriceFormControl?.clearValidators();
        this.acquisitionPriceFormControl?.updateValueAndValidity();
        this.requestedNotaryFeeFormControl?.reset();
        this.requestedNotaryFeeFormControl?.clearValidators();
        this.requestedNotaryFeeFormControl?.updateValueAndValidity();
        this.calculateInvestmentAmount();
        this.calculateLoanAmount();
        this.changeDetectorRef.detectChanges();
      }
    });
  }
  
  private onChangePeriodicity(){
    this.getControlValueChanges(this.periodicityFormControl).subscribe(() => {
      this.deadlineNumberFormControl?.updateValueAndValidity();
    });
  }

  public isItABuildingLotAcquisition() {
    return this.loanDataFormGroup?.get('loanObject')?.value?.code === 'AQS' &&
      this.loanDataFormGroup?.get('propertyType')?.value?.code === 'TRN';
  }

  public isMandatoryRiskAgreement(){
    return  this.toForcedNumber(this.loanDataFormGroup.get('loanAmount')?.value)>500000 && this.isMoulkia;
  }

  private validateAmounts() {
    let controls: string[] = ['claimedAmountOfBuildDevelopment', 'claimedAmountOfPurchase', 'additionalCredit'];
    const adlsakanControls: string[] = ['typeAloanAmount','typeBloanAmount'];
    const imtilakControls: string[] = ['subsidizedCreditAmount','bonusCreditAmount', 'suportedCreditAmount'];
    const SalafBaytiSanteControls: string[] = ['bonusCreditAmount'];   
    if(this.isImtilak || this.isImtilakPPR) controls = [...controls, ...imtilakControls];
    if(this.isSalafBaytiSante || this.isSalafBaytiSantePPR) controls = [...controls, ...SalafBaytiSanteControls];
    if(this.isAdlSakane || this.isAdlSakanePPR) controls = [...controls, ...adlsakanControls];

    const observables = controls.map(control =>
      this.getControlValueChanges(this.loanDataFormGroup.get(control), 400, null)
    );

    combineLatest(observables).subscribe(() => {
      if(this.isMechanismSelected()){
        this.claimedAmountOfPurchaseFormControl?.addValidators([this.perLessThanEqualToSumOfAmounts()])

        if(this.loanObjectFormControl?.value?.code?.includes('CST') || this.loanObjectFormControl?.value?.code?.includes('AMN')){
          this.claimedAmountOfBuildFormControl?.addValidators([this.equalToMechanismSum()]);
          this.claimedAmountOfBuildFormControl?.updateValueAndValidity();
        }


        this.claimedAmountOfPurchaseFormControl?.updateValueAndValidity();
      }
    });
  }

  private setFormControlValueAndDisable(observable$: Observable<any>, formControl: FormControl, code: any) {
    observable$?.pipe(
      map(items => items.find((item: any) => item.code === code))
    ).subscribe(value => {
      if (value) {
        formControl?.setValue(value);
        formControl?.disable();
        formControl?.updateValueAndValidity();
      }
    });
  }

  private initRateNature() {
    if (this.isFogaloge || this.isFogarim) {
      this.setFormControlValueAndDisable(this.rateNatures$!, this.rateNatureFormControl, "CNV");
    }
  }

  private initRateType() {
    if (this.isImtilak || this.isImtilakPPR || this.isFogaloge || this.isFogarim || this.isAdlSakane 
      || this.isAdlSakanePPR || this.isSalafBaytiSante || this.isSalafBaytiSantePPR) {
      this.setFormControlValueAndDisable(this.rateTypes$!, this.rateTypeFormControl, RateTypes.FIXE);
    }
    this.getControlValueChanges(this.rateTypeFormControl).subscribe(value => {
      if (value === RateTypes.CAPE) {
        this.cappedRateFormControl.addValidators([Validators.required, NumberValidators.greaterThanEqualTo({ fieldName: 'rate' })]);
      } else {
        this.cappedRateFormControl.removeValidators([Validators.required, NumberValidators.greaterThanEqualTo({ fieldName: 'rate' })]);
        this.cappedRateFormControl.reset();
      }

      this.cappedRateFormControl.updateValueAndValidity();
    });
  }

  private initDelayed() {

    this.getControlValueChanges(this.delayedFormControl).subscribe(value => {
      if (value === true ) {
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

  public onInitSalafBaytiSanteValues() {
      if (!(this.isSalafBaytiSante || this.isSalafBaytiSantePPR)) return;
      merge(
        this.bonusCreditDurationFormControl.valueChanges.pipe(
          startWith(this.bonusCreditDurationFormControl.value),
          debounceTime(200),
          distinctUntilChanged()
        ),
        this.additionalloanDurationFormControl.valueChanges.pipe(
          startWith(this.additionalloanDurationFormControl.value),
          debounceTime(200),
          distinctUntilChanged()
        )
      ).subscribe(() => {
          const durationBonus = this.loanDataFormGroup?.get('bonusCreditDuration')?.value;
          const durationAdditional = this.loanDataFormGroup?.get('additionalLoanDuration')?.value;
          // Mise à jour du taux pour la durée bonus
          if (durationBonus < 84) {
              this.setControlNumberValue(this.bonusCreditRateFormControl, 1.70);
          } else if (durationBonus >= 84 && durationBonus < 180) {
              this.setControlNumberValue(this.bonusCreditRateFormControl, 2.00);
          } else if (durationBonus >= 180 && durationBonus <= 240) {
              this.setControlNumberValue(this.bonusCreditRateFormControl, 2.25);
          }
          // Mise à jour du taux pour la durée additionnelle
          if (durationAdditional < 84) {
              this.setControlNumberValue(this.additionalCreditRateFormControl, 4.20);
          } else if (durationAdditional >= 84 && durationAdditional < 180) {
              this.setControlNumberValue(this.additionalCreditRateFormControl, 4.50);
          } else if (durationAdditional >= 180 && durationAdditional <= 240) {
              this.setControlNumberValue(this.additionalCreditRateFormControl, 4.75);
          }
          this.changeDetectorRef.detectChanges();
      });
  }

  public onChangeMechanisms() {
    if (!(this.isImtilak || this.isImtilakPPR || this.isAdlSakane || this.isAdlSakanePPR)) return;
    this.mechanismFormControl.valueChanges.pipe(
      startWith({}),
      debounceTime(200),
      pairwise(),
      tap(([previousValues, selectedValues]) => {
        this.resetMechanismFormControls(selectedValues);
        if (this.isImtilak || this.isImtilakPPR) { this.handleImtilakMechanisms(selectedValues); }
        if (this.isAdlSakane || this.isAdlSakanePPR) {
          const prevArray = Array.isArray(previousValues) ? previousValues : [];
          const selectedArray = Array.isArray(selectedValues) ? selectedValues : [];
          this.handleAdlSakaneMechanisms(prevArray, selectedArray);
        }

        this.changeDetectorRef.detectChanges();
      })
    ).subscribe();
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
        if (this.isMechanism1()) {
        this.setControlNumberValue(this.subsidizedCreditRateFormControl, subRate!);
        }
      
        if (this.isMechanism3()) {
        this.setControlNumberValue(this.suportedCreditRateFormControl, supRate!);
        }

        if(this.isMechanismSelected() && !this.isMechanism3()){
             this.setControlNumberValue(this.additionalCreditRateFormControl, addRate!);
        }
        
      });
  }

  private resetMechanismFormControls(selectedValues: any[]) {
    this.additionalCreditFormControl?.reset();
    this.additionalCreditRateFormControl?.reset();
    this.additionalloanDurationFormControl?.reset();

    if (!this.isMechanismExists(selectedValues, MechanismType.MECHANISM_1)) {
    this.subsidizedCreditRateFormControl?.reset();
    this.subsidizedCreditDurationFormControl?.reset();
    this.subsidizedCreditAmountFormControl?.reset();
    }
    if (!this.isMechanismExists(selectedValues, MechanismType.MECHANISM_2)) {
    this.bonusCreditAmountFormControl?.reset();
    this.bonusCreditRateFormControl?.reset();
    this.bonusCreditDurationFormControl?.reset();
    }
    if (!this.isMechanismExists(selectedValues, MechanismType.MECHANISM_3)) {
    this.suportedCreditAmountFormControl?.reset();
    this.suportedCreditDurationFormControl?.reset();
    this.suportedCreditRateFormControl?.reset();
    }
    if (!this.isMechanismExists(selectedValues, MechanismType.TYPE_A)) {
    this.typeAloanAmountFormControl?.reset();
    this.typeAloanDurationFormControl?.reset();
    this.typeAloanRateFormControl?.reset();
    }

    if (!this.isMechanismExists(selectedValues, MechanismType.TYPE_B)) {
      this.typeBloanAmountFormControl?.reset();
      this.typeBloanDurationFormControl?.reset();
      this.typeBloanRateFormControl?.reset();

    }
  }

  private handleImtilakMechanisms(selectedValues: any) {
    if (this.isMechanismExists(selectedValues, MechanismType.MECHANISM_1)) {
      this.setControlNumberValue(this.subsidizedCreditRateFormControl, 2.20);
      this.additionalloanDurationFormControl?.setValidators(this.getAdditionalLoanDurationValidators());
      this.additionalCreditRateFormControl.reset();
    }
    if (this.isMechanismExists(selectedValues, MechanismType.MECHANISM_2)) {
      this.bonusCreditDurationFormControl?.setValidators([
        NumberValidators.sumLessThanEqualTo({ fieldNameToAdd: 'delayDuration', value: 300 }),
        NumberValidators.lessThanEqualToWithCases({
          conditionalExpression: () => this.isItABuildingLotAcquisition(),
          fieldName: 'periodicity',
          keyField: 'code',
          maxValues: { 'MONTHLY': 120, 'ANNUAL': 10, 'BIMONTHLY': 240, 'QUARTERLY': 40 }
        }),
        NumberValidators.lessThanEqualTo({
          conditionalExpression: () => this.isMechanism2(),
          value: 180,
          extraFieldsToUpdateValidator: ['mechanism']
        })
      ]);

      this.additionalloanDurationFormControl?.setValidators(this.getAdditionalLoanDurationValidators());

      this.setControlNumberValue(this.bonusCreditRateFormControl, 0);
      this.additionalCreditRateFormControl.reset();
    }

    if (this.isMechanismExists(selectedValues, MechanismType.MECHANISM_3)) {
      this.setControlNumberValue(this.suportedCreditRateFormControl, 4.20);
    }
    this.bonusCreditDurationFormControl?.updateValueAndValidity();
    this.additionalloanDurationFormControl?.updateValueAndValidity();
  }

  private handleAdlSakaneMechanisms(previousValues: any[], selectedValues: any[]) {
    if ( this.isMechanismExists(selectedValues, MechanismType.TYPE_A)) {
      !this.typeAloanDurationFormControl?.value && this.setControlNumberValue(this.typeAloanDurationFormControl, 120, false);
      ! this.typeAloanRateFormControl?.value &&   this.setControlNumberValue(this.typeAloanRateFormControl, 0);
    }

    if ( this.isMechanismExists(selectedValues, MechanismType.TYPE_B)) {
      !this.typeBloanDurationFormControl?.value &&  this.setControlNumberValue(this.typeBloanDurationFormControl, 240, false);
      !this.typeBloanRateFormControl?.value &&    this.setControlNumberValue(this.typeBloanRateFormControl, 2);
    }
  }

  public onChangeLoanObject() {
    this.getControlValueChanges(this.loanObjectFormControl).subscribe(value => {
      this.applyRequestedNotaryFeeValidators(value?.code);
      if (value.code.includes('RCH') || value.code.includes('AQS') || value?.code?.includes('REGR_CRED')  || value?.code?.includes('REF_ACH_BI')) {
        this.claimedAmountOfPurchaseFormControl?.addValidators([Validators.required,  NumberValidators.lessThanEqualTo({ fieldName: 'acquisitionPrice' })]);
      } else {
        this.claimedAmountOfPurchaseFormControl.removeValidators(Validators.required);
        this.claimedAmountOfPurchaseFormControl.reset();
      }

      if (value.code.includes('CST') || value.code.includes('AMN')) {
        this.buildDevelopmentQuotationFormControl.addValidators(Validators.required);
        this.claimedAmountOfBuildFormControl.addValidators(Validators.required);
      } else {
        this.buildDevelopmentQuotationFormControl.removeValidators(Validators.required);
        this.buildDevelopmentQuotationFormControl.reset();
        this.claimedAmountOfBuildFormControl.removeValidators(Validators.required);
        this.claimedAmountOfBuildFormControl.reset();
      }

      if (value.code.includes('RCH')) {
        this.repurchaseTypeFormControl.addValidators(Validators.required);
      } else {
        this.repurchaseTypeFormControl.removeValidators(Validators.required);
      }

      this.buildDevelopmentQuotationFormControl.updateValueAndValidity();
      this.claimedAmountOfBuildFormControl.updateValueAndValidity();
    });
  }

  private getAdditionalLoanDurationValidators(): ValidatorFn[] {
    const validators: ValidatorFn[] = [
      NumberValidators.lessThanEqualTo({ value: 300 }),
      NumberValidators.sumLessThanEqualTo({ fieldNameToAdd: 'delayDuration', value: 300 }),
      NumberValidators.lessThanEqualToWithCases({
        conditionalExpression: () => this.isItABuildingLotAcquisition(),
        fieldName: 'periodicity',
        keyField: 'code',
        maxValues: { 'MONTHLY': 120, 'ANNUAL': 10, 'BIMONTHLY': 240, 'QUARTERLY': 40 }
      })
    ];

    if (this.isMechanism1() || this.isMechanism2()) {
      validators.unshift(Validators.required);
    }
    return validators;
  }

  private isAllFieldsValid(obj: any) :boolean{
    if( obj &&  typeof obj=== 'object') {
      return Object.keys(obj).every(key => obj[key] !== null && obj[key] !== undefined && (typeof obj[key] !=='number' || obj[key] !== 0) );
    }
    return false;
  }

  private isMechanismExists(arrayValues: Mechanism | Mechanism[], value: string): boolean {
    if (!Array.isArray(arrayValues)) {
      arrayValues = [arrayValues];
    }
    return !!arrayValues.find(mechanism => mechanism && mechanism.code === value);
  }

  public isSelectedProduct(productCode: string) { return this.selectedProduct?.code === productCode; }

  public isSelectedProductIn(productsCode: string[]) { return productsCode.includes(this.selectedProduct?.code); }

  public isMechanismSelected() {
    const mechanism = this.mechanismFormControl?.value;
    return mechanism && (mechanism.length > 0 || Object.keys(mechanism).length > 0);
  }

  private forceRepurchaseTypeINTForSpecificLoanObjects(): void {
    if (!this.loanDataFormGroup) return;

    this.loanObjectFormControl.valueChanges
      .pipe(startWith(this.loanObjectFormControl.value), takeUntil(this.destroy$))
      .subscribe((loanObject: any) => {
        const code = loanObject?.code;
        const mustForce = code === 'AQS_RCH_CSO' || code === 'AQS_RCH_CSO_AMN' || code === 'AQS_RCH_CSO_CST';

        if (mustForce) {
          this.setFormControlValueAndDisable(this.repurchaseTypes$, this.repurchaseTypeFormControl, 'INT');
        } else {
          this.repurchaseTypeFormControl.enable({ emitEvent: false });
        }
      });
  }

  private confirmResetRepurchasedCreditNumberOnLoanObjectChange(): void {
    const loanObjectCtrl = this.loanDataFormGroup.get('loanObject') as FormControl | null;
    const repurchasedCtrl = this.loanDataFormGroup.get('repurchasedCreditNumber') as FormControl | null;

    if (!loanObjectCtrl || !repurchasedCtrl) return;

    let previousLoanObject = loanObjectCtrl.value;

    loanObjectCtrl.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((nextLoanObject: any) => {
        const prevCode = previousLoanObject?.code;
        const cameFromAqsRch = !!prevCode && prevCode.includes('AQS_RCH');

        const currentNumber = (repurchasedCtrl.value ?? '').toString().trim();
        const hasNumber = currentNumber.length > 0;

        if (!cameFromAqsRch || !hasNumber) {
          previousLoanObject = nextLoanObject;
          return;
        }
        loanObjectCtrl.setValue(previousLoanObject, { emitEvent: false });

        this.dialogConfirmationService.confirm({
          headerKey: 'loan.repurchase.changeObject.confirm.header',
          messageKey: 'loan.repurchase.changeObject.confirm.message',
          acceptLabel: 'loan.repurchase.changeObject.confirm',
          rejectLabel: 'loan.repurchase.changeObject.cancel',
          acceptCallback: () => {
            loanObjectCtrl.setValue(nextLoanObject, { emitEvent: false });
            repurchasedCtrl.reset(null);
            previousLoanObject = nextLoanObject;
          }
        });
      });
  }

  // ---------------------------  build loan form fields  ----------------------

  private initDossierForm(dossier: DossierData){
    const personalInfo = dossier.customerData?.personalInfo;
    const isNotConventionedProduct =  !this.isSelectedProductIn([Products.IMTILAK,
                                        Products.IMTILAK_PPR,
                                        Products.ADL_SAKANE,
                                        Products.ADL_SAKANE_PPR,
                                        Products.SALAF_BAYTI_SANTE,
                                        Products.SALAF_BAYTI_SANTE_PPR]);
    this.isClipriMRE = ['MCH/01', 'MCH/01PRI', 'MCH/09PRI'].includes(personalInfo?.market!);
    this.isPPIProduct=this.isSelectedProductIn([Products.PPI_CLASSIQUE, Products.PPI_PPR_FONC]);
    this.isVeFa=this.isSelectedProduct(Products.PPI_VEFA_RESIDENT);
    this.isPPIEngagementPromoteur=this.isSelectedProduct(Products.PPI_Engagement_Promoteur);    
    this.isImtilak = this.isSelectedProduct(Products.IMTILAK);
    this.isImtilakPPR = this.isSelectedProduct(Products.IMTILAK_PPR);
    this.isAdlSakane = this.isSelectedProduct(Products.ADL_SAKANE);
    this.isAdlSakanePPR = this.isSelectedProduct(Products.ADL_SAKANE_PPR);
    this.isSalafBaytiSante = this.isSelectedProduct(Products.SALAF_BAYTI_SANTE);
    this.isSalafBaytiSantePPR = this.isSelectedProduct(Products.SALAF_BAYTI_SANTE_PPR);
    this.isFogarim = this.isSelectedProduct(Products.FOGARIM);
    this.isFogaloge = this.isSelectedProduct(Products.FOGALOGE);
    this.isMoulkia=this.isSelectedProduct(Products.MOULKIA);
    this.isPpiMRE=this.isSelectedProduct(Products.PPI_MRE);
    this.isProspect = dossier.customerData?.personalInfo?.prospect!;
    this.isAccordPrincipe= dossier.accord ==='PRINCIPE';

    if (isNotConventionedProduct) {
      this.loanDataFormGroup.addControl("rate", new FormControl(null, [Validators.required]));
    }

    if(this.isVeFa){
      this.acquisitionPriceFormControl?.clearValidators();
      this.acquisitionPriceFormControl?.addValidators([Validators.required,  NumberValidators.sumGreaterThanEqualTo({ fieldNameCoefficient: 0.9, fieldName: 'claimedAmountOfPurchase' })]);
      this.acquisitionPriceFormControl?.updateValueAndValidity();
    }

    if (this.isFogaloge || this.isFogarim || this.isImtilak || this.isImtilakPPR || this.isAdlSakane|| this.isAdlSakanePPR) {
      this.setFormControlValueAndDisable(this.periodicities$, this.periodicityFormControl, "MONTHLY");
    }

    if(this.isMoulkia){
      this.acquisitionPriceFormControl?.clearValidators();
      this.acquisitionPriceFormControl?.addValidators([Validators.required,  NumberValidators.sumPercentLessThanEqualTo({ fieldNameCoefficient: 0.8,  fieldName: 'claimedAmountOfPurchase' })]);
      this.acquisitionPriceFormControl?.updateValueAndValidity();
    }
  }

  private initLoanDataForm() {
    const isProspect = this.dossierStore.get().customerData?.personalInfo?.prospect ===true;
    this.loanDataFormGroup.addControl("apport", new FormControl({ value: null, disabled: true }, [Validators.required]));
    this.loanDataFormGroup.addControl("percentOfApport", new FormControl({ value: null, disabled: true }, [Validators.required]));
    //desactivating debt info in case of a prospect
    this.loanDataFormGroup.addControl("debtRatio", new FormControl({ value: null, disabled: true } , isProspect?[]: [Validators.required]));
    this.loanDataFormGroup.addControl("isExternDebtsRetrieved", new FormControl({ value: null, disabled: true } , isProspect?[]: [Validators.required]));
    this.loanDataFormGroup.addControl("isExternDebtsInfnRetrieved", new FormControl({ value: null, disabled: true }, isProspect?[]: [Validators.required]));
    this.loanDataFormGroup.addControl("rateType", new FormControl(null, [Validators.required]));
    this.loanDataFormGroup.addControl("rateNature", new FormControl(null, [Validators.required]));
    this.loanDataFormGroup.addControl("cappedRate", new FormControl());
    this.loanDataFormGroup.addControl("delayed", new FormControl(false, [Validators.required]));
    this.loanDataFormGroup.addControl("delayType", new FormControl());
    this.loanDataFormGroup.addControl("delayDuration", new FormControl());
    this.loanDataFormGroup.addControl("loanObject", new FormControl(null, [Validators.required]));
    this.loanDataFormGroup.addControl("repurchasedCreditNumber", new FormControl(null));
    this.loanDataFormGroup.addControl("repurchaseType", new FormControl());
    this.loanDataFormGroup.addControl("periodicity", new FormControl(null, [Validators.required]));
    this.loanDataFormGroup.addControl("propertyType", new FormControl(null, [Validators.required]));
    this.loanDataFormGroup.addControl("acquisitionPrice", new FormControl(null, [Validators.required, NumberValidators.sumGreaterThanEqualTo({ fieldNameToAdd: 'acquisitionFee', fieldName: 'claimedAmountOfPurchase' })]));
    this.loanDataFormGroup.addControl("firstDueDate", new FormControl(null, [Validators.required]));
    this.loanDataFormGroup.addControl("applicationFee", new FormControl({ value: null, disabled: false }, [Validators.required, NumberValidators.lessThanEqualTo({ fieldName: 'loanAmount', fieldNameCoefficient: 0.001 })]));
    this.loanDataFormGroup.addControl("freeHandFee", new FormControl(800, [Validators.required]));
    this.loanDataFormGroup.addControl("investmentAmount", new FormControl({ value: null, disabled: true }, [Validators.required]));
    this.loanDataFormGroup.addControl("claimedAmountOfPurchase", new FormControl(null));
    this.loanDataFormGroup.addControl("buildDevelopmentQuotation", new FormControl());
    this.loanDataFormGroup.addControl("claimedAmountOfBuildDevelopment", new FormControl(null, [NumberValidators.lessThanEqualTo({ fieldName: 'buildDevelopmentQuotation' })]));
    this.loanDataFormGroup.addControl("loanAmount", new FormControl({ value: null, disabled: true }, [
      Validators.required, NumberValidators.lessThanEqualTo({ fieldName: 'investmentAmount' }), this.lessThanEqualToSumOfAmounts()]));
    this.loanDataFormGroup.addControl("externalRealStateLoan", new FormControl({ value: null, disabled: false }, [Validators.required]));
    this.loanDataFormGroup.addControl("externalConsomptionLoan", new FormControl({ value: null, disabled: false }, [Validators.required]));
    if(!this.isImtilak && !this.isImtilakPPR && !this.isAdlSakane && !this.isAdlSakanePPR && !this.isSalafBaytiSante && !this.isSalafBaytiSantePPR ){
      this.loanDataFormGroup.addControl("deadlineNumber", new FormControl(null, [Validators.required,
          NumberValidators.sumLessThanEqualTo({ conditionalExpression: () => !this.isMechanismSelected(), fieldNameToAdd: 'delayDuration', value: 300, }),
          NumberValidators.lessThanEqualToWithCases({ conditionalExpression: () => this.isItABuildingLotAcquisition(), fieldName: 'periodicity',keyField: 'code', maxValues: {'MONTHLY':120,'ANNUAL':10,'BIANNUAL':20,'QUARTERLY':40} }),
        ]),
      );
    }

    this.loanDataFormGroup.addControl("acquisitionFee", new FormControl());
    this.loanDataFormGroup.addControl("requestedNotaryFee", new FormControl());
    

    this.loanDataFormGroup.get('rateType')?.valueChanges.subscribe(value => {
      if (value.code === this.rateTypes.CAPE) {
        this.cappedRateFormControl?.addValidators([Validators.required, NumberValidators.greaterThanEqualTo({ fieldName: 'rate' })]);
      } else {
        this.cappedRateFormControl?.removeValidators([Validators.required, NumberValidators.greaterThanEqualTo({ fieldName: 'rate' })]);
        this.cappedRateFormControl?.reset();
      }
      this.cappedRateFormControl?.updateValueAndValidity();
    });
  }

  private initCcgCommissionChargeTypeControls() {
    if (this.isFogaloge || this.isFogarim) {
      this.loanDataFormGroup.addControl("socialHousing", new FormControl({ value: null, disabled: true }, [Validators.required]));
      this.loanDataFormGroup.addControl("area", new FormControl(null, [Validators.required]));
      this.loanDataFormGroup.addControl("monthlyCoefficient", new FormControl({ value: null, disabled: true }, [Validators.required]));
      this.loanDataFormGroup.addControl("ccgCommissionChargeType", new FormControl(null, [Validators.required]));
    }
  }

  private initMechanismsControls() {
    if (this.isImtilak || this.isImtilakPPR || this.isAdlSakane || this.isAdlSakanePPR || this.isSalafBaytiSante || this.isSalafBaytiSantePPR) {      
      this.setFormControlValueAndDisable(this.rateNatures$!, this.rateNatureFormControl, "CNV");
      this.loanDataFormGroup.addControl("mechanisms", new FormControl(null, [Validators.required]));
      this.loanDataFormGroup.addControl("additionalCredit", new FormControl());
      this.loanDataFormGroup.addControl("additionalCreditRate", new FormControl());
      this.loanDataFormGroup.addControl("additionalLoanDuration", new FormControl(null, this.getAdditionalLoanDurationValidators())
    );

      if (this.isSalafBaytiSante || this.isSalafBaytiSantePPR) {
        this.loanDataFormGroup.addControl("bonusCreditAmount", new FormControl(null, { validators: NumberValidators.lessThanEqualTo({ value: 300000 }) }));
        this.loanDataFormGroup.addControl("bonusCreditRate", new FormControl());
        this.loanDataFormGroup.addControl("bonusCreditDuration", new FormControl(null, [
          NumberValidators.sumLessThanEqualTo({  fieldNameToAdd: 'delayDuration', value: 300, }),
          NumberValidators.lessThanEqualToWithCases({ conditionalExpression: () => this.isItABuildingLotAcquisition(), fieldName: 'periodicity',keyField: 'code', maxValues: {'MONTHLY':120,'ANNUAL':10,'BIANNUAL':20,'QUARTERLY':40} }),
          NumberValidators.lessThanEqualTo({ conditionalExpression: () => this.isMechanism2(), value: 240, extraFieldsToUpdateValidator: ['mechanism'] }),
        ]))
      }

      if (this.isImtilak || this.isImtilakPPR) {
        this.loanDataFormGroup.addControl("subsidizedCreditAmount", new FormControl(null, { validators: NumberValidators.lessThanEqualTo({ value: 300000 }) }));
        this.loanDataFormGroup.addControl("bonusCreditAmount", new FormControl(null, { validators: NumberValidators.lessThanEqualTo({ value: 200000 }) }));
        this.loanDataFormGroup.addControl("suportedCreditAmount", new FormControl());
        this.loanDataFormGroup.addControl("subsidizedCreditRate", new FormControl());
        this.loanDataFormGroup.addControl("bonusCreditRate", new FormControl());
        this.loanDataFormGroup.addControl("suportedCreditRate", new FormControl());
        this.loanDataFormGroup.addControl("subsidizedCreditDuration", new FormControl(null, [
          NumberValidators.sumLessThanEqualTo({  fieldNameToAdd: 'delayDuration', value: 300, }),
          NumberValidators.lessThanEqualToWithCases({ conditionalExpression: () => this.isItABuildingLotAcquisition(), fieldName: 'periodicity',keyField: 'code', maxValues: {'MONTHLY':120,'ANNUAL':10,'BIANNUAL':20,'QUARTERLY':40} }) ]));
        this.loanDataFormGroup.addControl("bonusCreditDuration", new FormControl(null, [
          NumberValidators.sumLessThanEqualTo({  fieldNameToAdd: 'delayDuration', value: 300, }),
          NumberValidators.lessThanEqualToWithCases({ conditionalExpression: () => this.isItABuildingLotAcquisition(), fieldName: 'periodicity',keyField: 'code', maxValues: {'MONTHLY':120,'ANNUAL':10,'BIANNUAL':20,'QUARTERLY':40} }),
          NumberValidators.lessThanEqualTo({ conditionalExpression: () => this.isMechanism2(), value: 180, extraFieldsToUpdateValidator: ['mechanism'] }),
        ]))
        this.loanDataFormGroup.addControl("suportedCreditDuration", new FormControl(null , [
          NumberValidators.sumLessThanEqualTo({  fieldNameToAdd: 'delayDuration', value: 300, }),
          NumberValidators.lessThanEqualToWithCases({ conditionalExpression: () => this.isItABuildingLotAcquisition(), fieldName: 'periodicity',keyField: 'code', maxValues: {'MONTHLY':120,'ANNUAL':10,'BIANNUAL':20,'QUARTERLY':40} })
        ]));
      }

      if (this.isAdlSakane || this.isAdlSakanePPR) {
        this.loanDataFormGroup.addControl("typeAloanAmount", new FormControl(null, { validators: NumberValidators.lessThanEqualTo({ value: 150000  }) }));
        this.loanDataFormGroup.addControl("typeBloanAmount", new FormControl(null, { validators: NumberValidators.lessThanEqualTo({ value: 250000 }) }));
        this.loanDataFormGroup.addControl("typeAloanDuration", new FormControl(null,
           [NumberValidators.lessThanEqualTo({ value: 120 }) ,
            NumberValidators.sumLessThanEqualTo({  fieldNameToAdd: 'delayDuration', value: 300, })
           ]));
        this.loanDataFormGroup.addControl("typeBloanDuration", new FormControl(null,
          [ NumberValidators.lessThanEqualToWithCases({ conditionalExpression: () => this.isItABuildingLotAcquisition(), fieldName: 'periodicity',keyField: 'code', maxValues: {'MONTHLY':120,'ANNUAL':10,'BIANNUAL':20,'QUARTERLY':40} }),
          NumberValidators.sumLessThanEqualTo({  fieldNameToAdd: 'delayDuration', value: 300, }),
          NumberValidators.lessThanEqualTo({ value: 240 })
          ]));
        this.loanDataFormGroup.addControl("typeAloanRate", new FormControl());
        this.loanDataFormGroup.addControl("typeBloanRate", new FormControl());
      }      
    }
  }


  // ---------------------------  Loan validators  -----------------------------
  
  private loanAmountGroupValidator(): ValidatorFn {
    return (group: AbstractControl): ValidationErrors | null => {
      const fg = group as FormGroup;
      const { loanAmount } = fg.getRawValue(); 
  
      if (loanAmount == null ) {
        return null;
      }

      if (loanAmount < 100 ) {
        return { loanAmountInvalid: { loanAmount} };
      }
  
      return null;
    };
  }

  private equalToMechanismSum(): ValidatorFn {
    return (control: AbstractControl): { [key: string]: any } | null => {
      const loanCode = this.loanObjectFormControl?.value?.code;

      const dev = this.loanDataFormGroup.get('claimedAmountOfBuildDevelopment')?.value;
      const pur = this.loanDataFormGroup.get('claimedAmountOfPurchase')?.value;

      let totalEntered: number;

      if (loanCode?.includes('AQS')) {
        if (dev == null || pur == null) {
          return { equalToMechanismSum: 'incomplete' };
        }
        totalEntered = NumberUtils.toForcedNumber(dev) + NumberUtils.toForcedNumber(pur);
      } else {
        if (dev == null) {
          return { equalToMechanismSum: 'incomplete' };
        }
        totalEntered = NumberUtils.toForcedNumber(dev);
      }

      const expectedSum = this.getSumOfMecanismAmounts();
      if (expectedSum === -1) {
        return null;
      }
      return totalEntered === expectedSum
        ? null
        : { equalToMechanismSum: { expected: expectedSum, actual: totalEntered } };
    };
  }

  private perLessThanEqualToSumOfAmounts(): ValidatorFn {
    return (control: AbstractControl): { [key: string]: any } | null => {
      const loanAmount = control?.value;
      const sumOfAmounts = this.getSumOfMecanismAmounts();

      return sumOfAmounts >= loanAmount || sumOfAmounts === -1 ? null : { lessThanEqualToSumOfAmounts: true };
    };
  }

  private lessThanEqualToSumOfAmounts(): ValidatorFn {
    return (control: AbstractControl): { [key: string]: any } | null => {
      const loanAmount = this.loanAmountFormControl?.value;
      const sumOfAmounts = this.getSumOfMecanismAmounts();

      return sumOfAmounts <= loanAmount || sumOfAmounts === -1 ? null : { lessThanEqualToSumOfAmounts: true };
    };
  }

  private repurchasedCreditNumberValidator(): ValidatorFn {
    return (group: AbstractControl): ValidationErrors | null => {
      const fg = group as FormGroup;

      const loanObjectCode = fg.get('loanObject')?.value?.code ?? '';
      if (!loanObjectCode.includes('AQS_RCH')) return null;

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

  private getSumOfMecanismAmounts(): number {
    const selectedMechanisms = this.mechanismFormControl?.value;
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

  // --------------------------- Loan calculations -----------------------------

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Montant d'investissement
  //    = acquisitionPrice + buildDevelopmentQuotation [+ acquisitionFee si PPI/ClipriMRE]
  // ───────────────────────────────────────────────────────────────────────────
  private calculateInvestmentAmount(): void {
    const price$     = this.getControlValueChanges(this.acquisitionPriceFormControl, 0, this.acquisitionPriceFormControl?.value);
    const quotation$ = this.getControlValueChanges(this.buildDevelopmentQuotationFormControl, 0, this.buildDevelopmentQuotationFormControl?.value);
    const fee$       = (this.isPPIProduct || (this.isPpiMRE && this.isClipriMRE)) && this.loanDataFormGroup.contains("acquisitionFee")
      ? this.getControlValueChanges(this.acquisitionFeeFormControl, 0, this.acquisitionFeeFormControl?.value)
      : of(0);
  
    merge(price$, quotation$, fee$)
      .pipe(
        takeUntil(this.destroy$),
        map(() => {
          const acquisitionPrice     = this.toForcedNumber(this.acquisitionPriceFormControl?.value);
          const developmentQuotation = this.toForcedNumber(this.buildDevelopmentQuotationFormControl?.value);
          const acquisitionFee       = (this.isPPIProduct || (this.isPpiMRE && this.isClipriMRE))
            ? this.toForcedNumber(this.acquisitionFeeFormControl?.value)
            : 0;
          return acquisitionPrice + developmentQuotation + acquisitionFee;
        }),
        tap(totalInvestment => {
          if (totalInvestment > 0) {
            this.setControlNumberValue(this.investmentAmountFormControl, totalInvestment);
          }
        })
      )
      .subscribe();
  }  

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Montant demandé
  //    = claimedAmountOfBuildDevelopment + claimedAmountOfPurchase [+ requestedNotaryFee si PPI/ClipriMRE]
  //    → met aussi à jour applicationFee (loanAmount × 0.001)
  //    → notifie TopVipService
  // ───────────────────────────────────────────────────────────────────────────
  private calculateLoanAmount(): void {
    const buildCost$ = this.getControlValueChanges( this.claimedAmountOfBuildDevelopmentFormControl,  0,  this.claimedAmountOfBuildDevelopmentFormControl?.value);
    const purchase$  = this.getControlValueChanges(  this.claimedAmountOfPurchaseFormControl, 0, this.claimedAmountOfPurchaseFormControl?.value );
    const notary$    = (this.isPPIProduct || (this.isPpiMRE && this.isClipriMRE)) && this.loanDataFormGroup.contains("requestedNotaryFee")
      ? this.getControlValueChanges(this.requestedNotaryFeeFormControl, 0, this.requestedNotaryFeeFormControl?.value ?? null)
     : of(0);
  
    merge(buildCost$, purchase$, notary$)
      .pipe(
        takeUntil(this.destroy$),
        map(() => this.computeSum()),
        tap(loanSum => {          
          this.setControlNumberValue(this.loanDataFormGroup.get('loanAmount'), loanSum);
          const applicationFee = NumberUtils.round(loanSum * 0.001, 2);
          this.setControlNumberValue(this.loanDataFormGroup.get('applicationFee'), applicationFee);
          this.topVipService.next(loanSum);
        })
      )
      .subscribe();
  }

  private computeSum(): number {
    const buildDevelopmentAmount = this.toForcedNumber(this.claimedAmountOfBuildDevelopmentFormControl?.value);
    const purchaseAmount = this.toForcedNumber(this.claimedAmountOfPurchaseFormControl?.value);
    const notaryFee = (this.isPPIProduct || (this.isPpiMRE && this.isClipriMRE))  ? this.toForcedNumber(this.requestedNotaryFeeFormControl?.value): 0;
    return buildDevelopmentAmount + purchaseAmount + notaryFee;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Pourcentage d'apport
  //    = (apport / investmentAmount) × 100
  // ───────────────────────────────────────────────────────────────────────────
  private calculatePercentOfApport(): void {
    const apport$     = this.getControlValueChanges(this.loanDataFormGroup.get('apport'), 0, this.loanDataFormGroup.get('apport')!.value);
    const investment$ = this.getControlValueChanges(this.loanDataFormGroup.get('investmentAmount'), 0, this.loanDataFormGroup.get('investmentAmount')!.value);
  
    merge(apport$, investment$)
      .pipe(
        takeUntil(this.destroy$),
        map(() => {
          const apportValue     = this.toForcedNumber(this.loanDataFormGroup.get('apport')!.value);
          const investmentValue = this.toForcedNumber(this.loanDataFormGroup.get('investmentAmount')!.value);
          return investmentValue > 0 ? (apportValue * 100) / investmentValue : 0;
        }),
        tap(percent => {
          this.setControlNumberValue(this.loanDataFormGroup.get('percentOfApport'), NumberUtils.round(percent, 2));
        })
      )
      .subscribe();
  }
  
  // ───────────────────────────────────────────────────────────────────────────
  // 3. Apport personnel
  //    = max(investmentAmount - loanAmount, 0)
  // ───────────────────────────────────────────────────────────────────────────
  private calculateApport(): void {
    const loan$       = this.getControlValueChanges(this.loanAmountFormControl, 0, this.loanAmountFormControl?.value);
    const investment$ = this.getControlValueChanges(this.investmentAmountFormControl, 0, this.investmentAmountFormControl?.value);
  
    merge(loan$, investment$)
      .pipe(
        takeUntil(this.destroy$),
        map(() => {
          const loanValue       = this.toForcedNumber(this.loanAmountFormControl?.value);
          const investmentValue = this.toForcedNumber(this.investmentAmountFormControl?.value);
          return Math.max(investmentValue - loanValue, 0);
        }),
        tap(apportValue => {
          this.setControlNumberValue(this.loanDataFormGroup.get('apport'), apportValue);
        })
      )
      .subscribe();
  } 

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Logement social (Fogarim / Fogaloge uniquement)
  //    area entre 50 et 80 m² → socialHousing = true
  // ───────────────────────────────────────────────────────────────────────────
  private calculateSocialHousing() {
    if (this.isFogaloge || this.isFogarim) {
      this.getControlValueChanges(this.areaFormControl, 600).subscribe(value => {
        if(value){
          this.socialHousingFormControl.setValue(value && !(value < 50 || value > 80))
        }else{
          this.monthlyCoefficientFormControl.reset()
        }
      });
    }
  }


  // ───────────────────────────────────────────────────────────────────────────
  // 6. Coefficient mensuel CCG (Fogarim / Fogaloge uniquement)
  //    Appel HTTP via calculateCCGCommission — switchMap pour éviter les races
  // ───────────────────────────────────────────────────────────────────────────
  private calculateMonthlyCoefficient() {
    if (this.isFogaloge || this.isFogarim) {
      const loanAmount$ = this.getControlValueChanges(this.loanAmountFormControl, 400, 0);
      const investmentAmount$ = this.getControlValueChanges(this.investmentAmountFormControl, 400, 0);
      const deadlineNumber$ = this.getControlValueChanges(this.deadlineNumberFormControl, 400, 0);
      const loanRate$ = this.getControlValueChanges(this.loanRateFormControl, 400, 0);
      const ccgCommissionChargeType$ = this.getControlValueChanges(this.ccgCommissionChargeTypeFormControl, 400);
      const socialHousing$ = this.getControlValueChanges(this.socialHousingFormControl, 400,false);
      const areaHousing$ = this.getControlValueChanges(this.areaFormControl, 400,0);

      const combinedValues$ = combineLatest([loanAmount$, investmentAmount$, deadlineNumber$, loanRate$, ccgCommissionChargeType$, socialHousing$,areaHousing$]).pipe(
        map(([ loanAmount, investmentAmount, deadlineNumber,  loanRate, ccgCommissionChargeType, socialHousing, areaHousing]) => ({ loanAmount, investmentAmount, deadlineNumber, loanRate, ccgCommissionChargeType, socialHousing, areaHousing})));

      combinedValues$.subscribe(({loanAmount, investmentAmount, deadlineNumber, loanRate, ccgCommissionChargeType, socialHousing, areaHousing}) => {
        const ccgCommessionRequest={
          loanAmount : NumberUtils.toForcedNumber(loanAmount),
          investmentAmount : NumberUtils.toForcedNumber(investmentAmount),
          loanRate :  NumberUtils.toForcedNumber(loanRate),
          duration : NumberUtils.toForcedNumber(deadlineNumber),
          isSocialHousing:socialHousing,
          codeProduct:this.selectedProduct?.code,
          ccgCommissionChargeType,
          areaHousing
        }
        if(this.isAllFieldsValid(ccgCommessionRequest)){
          this.dossierDataService.calculateCCGCommission(ccgCommessionRequest).subscribe((ccgCommissionData:CcgCommessionMatrix)=>{
            this.dossierStore.update({ ccgCommessionMatrix: ccgCommissionData },true,false)
            this.monthlyCoefficientFormControl.setValue(ccgCommissionData?.ccgCommission);
          });
        }
      });
    }
  }

  // Form values
 
  public isMechanism1() { return this.isMechanismExists(this.mechanismFormControl?.value, MechanismType.MECHANISM_1);}
  public isMechanism2() { return this.isMechanismExists(this.mechanismFormControl?.value, MechanismType.MECHANISM_2);}
  public isMechanism3() { return this.isMechanismExists(this.mechanismFormControl?.value, MechanismType.MECHANISM_3);}
  public isTypeA()      { return this.isMechanismExists(this.mechanismFormControl?.value, MechanismType.TYPE_A); }
  public isTypeB()      { return this.isMechanismExists(this.mechanismFormControl?.value, MechanismType.TYPE_B); }
  
  get loanObject() { return this.loanDataFormGroup?.get('loanObject')?.value; }
  get repurchaseType() { return this.loanDataFormGroup?.get('repurchaseType')?.value; }
  get periodicity() { return this.loanDataFormGroup?.get('periodicity')?.value; }
  get rateType() { return this.loanDataFormGroup?.get('rateType')?.value; }
  get delayed() { return this.loanDataFormGroup?.get('delayed')?.value; }
  get delayType() { return this.loanDataFormGroup?.get('delayType')?.value; }
  get delayDuration() { return this.loanDataFormGroup?.get('delayDuration')?.value; }
  get acquisitionPrice() { return this.loanDataFormGroup?.get('acquisitionPrice')?.value; }
  get acquisitionPriceFormControl() { return this.loanDataFormGroup?.get('acquisitionPrice'); }
  get acquisitionFee() { return this.loanDataFormGroup?.get('acquisitionFee')?.value; }
  get buildDevelopmentQuotation() { return this.loanDataFormGroup?.get('buildDevelopmentQuotation')?.value; }
  get ccgCommissionChargeType() { return this.loanDataFormGroup.get('ccgCommissionChargeType')?.value; }

  // Controls
  get mechanismFormControl() { return this.loanDataFormGroup.get("mechanisms") as FormControl; }
  get periodicityFormControl() { return this.loanDataFormGroup.get("periodicity") as FormControl; }
  get requestedNotaryFeeFormControl() { return this.loanDataFormGroup?.get('requestedNotaryFee') as FormControl; }
  get claimedAmountOfBuildFormControl() { return this.loanDataFormGroup.get('claimedAmountOfBuildDevelopment') as FormControl; }
  get claimedAmountOfPurchaseFormControl() { return this.loanDataFormGroup.get('claimedAmountOfPurchase') as FormControl; }
  get claimedAmountOfBuildDevelopmentFormControl() { return this.loanDataFormGroup.get('claimedAmountOfBuildDevelopment') as FormControl; }
  get deadlineNumberFormControl() { return this.loanDataFormGroup.get('deadlineNumber') as FormControl; }
  get areaFormControl() { return this.loanDataFormGroup.get('area') as FormControl; }
  get socialHousingFormControl() { return this.loanDataFormGroup.get('socialHousing') as FormControl; }
  get loanAmountFormControl() { return this.loanDataFormGroup.get('loanAmount') as FormControl; }
  get investmentAmountFormControl() { return this.loanDataFormGroup.get('investmentAmount') as FormControl; }
  get loanRateFormControl() { return this.loanDataFormGroup.get('rate') as FormControl; }
  get ccgCommissionChargeTypeFormControl() { return this.loanDataFormGroup.get('ccgCommissionChargeType') as FormControl; }
  get monthlyCoefficientFormControl() { return this.loanDataFormGroup.get('monthlyCoefficient') as FormControl; }
  get subsidizedCreditRateFormControl() { return this.loanDataFormGroup.get('subsidizedCreditRate') as FormControl; }
  get bonusCreditRateFormControl() { return this.loanDataFormGroup.get('bonusCreditRate') as FormControl; }
  get suportedCreditRateFormControl() { return this.loanDataFormGroup.get('suportedCreditRate') as FormControl; }
  get additionalCreditRateFormControl() { return this.loanDataFormGroup.get('additionalCreditRate') as FormControl; }
  get typeAloanAmountFormControl() { return this.loanDataFormGroup.get('typeAloanAmount') as FormControl; }
  get typeBloanAmountFormControl() { return this.loanDataFormGroup.get('typeBloanAmount') as FormControl; }
  get subsidizedCreditDurationFormControl() { return this.loanDataFormGroup.get('subsidizedCreditDuration') as FormControl; }
  get bonusCreditDurationFormControl() { return this.loanDataFormGroup.get('bonusCreditDuration') as FormControl; }
  get suportedCreditDurationFormControl() { return this.loanDataFormGroup.get('suportedCreditDuration') as FormControl; }
  get typeAloanDurationFormControl() { return this.loanDataFormGroup.get('typeAloanDuration') as FormControl; }
  get typeBloanDurationFormControl() { return this.loanDataFormGroup.get('typeBloanDuration') as FormControl;}
  get typeAloanRateFormControl() { return this.loanDataFormGroup.get('typeAloanRate') as FormControl;}
  get typeBloanRateFormControl() { return this.loanDataFormGroup.get('typeBloanRate') as FormControl;}
  get subsidizedCreditAmountFormControl() { return this.loanDataFormGroup.get('subsidizedCreditAmount') as FormControl;}
  get bonusCreditAmountFormControl() { return this.loanDataFormGroup.get('bonusCreditAmount') as FormControl;}
  get suportedCreditAmountFormControl() { return this.loanDataFormGroup.get('suportedCreditAmount') as FormControl;}
  get additionalCreditFormControl() { return this.loanDataFormGroup.get('additionalCredit') as FormControl;}
  get additionalloanDurationFormControl() { return this.loanDataFormGroup.get('additionalLoanDuration') as FormControl;}
  get rateTypeFormControl() { return this.loanDataFormGroup.get('rateType') as FormControl;}
  get rateNatureFormControl(){ return this.loanDataFormGroup.get('rateNature') as FormControl;}
  get cappedRateFormControl() { return this.loanDataFormGroup.get('cappedRate') as FormControl;}
  get rateFormControl() { return this.loanDataFormGroup.get('rate') as FormControl;}
  get loanObjectFormControl() { return this.loanDataFormGroup.get('loanObject') as FormControl;}
  get buildDevelopmentQuotationFormControl() { return this.loanDataFormGroup.get('buildDevelopmentQuotation') as FormControl;}
  get acquisitionFeeFormControl() { return this.loanDataFormGroup.get('acquisitionFee') as FormControl;}
  get repurchaseTypeFormControl() { return this.loanDataFormGroup.get('repurchaseType') as FormControl;}
  get delayedFormControl() { return this.loanDataFormGroup.get('delayed') as FormControl;}
  get applicationFeeFormControl() { return this.loanDataFormGroup.get('applicationFee') as FormControl;}
  get delayTypeFormControl() { return this.loanDataFormGroup.get('delayType') as FormControl;}
  get delayDurationFormControl() { return this.loanDataFormGroup.get('delayDuration') as FormControl;}
  get firstDueDateFormControl() { return this.loanDataFormGroup.get('firstDueDate') as FormControl;}
  get externalRealStateLoanFormControl() { return this.loanDataFormGroup.get('externalRealStateLoan') as FormControl;}
  get externalConsomptionLoanFormControl() { return this.loanDataFormGroup.get('externalConsomptionLoan') as FormControl;}
  get isRepurchaseTypeForcedToINT(): boolean {
    const code = this.loanObjectFormControl?.value?.code;
    return code === 'AQS_RCH_CSO' || code === 'AQS_RCH_CSO_AMN' || code === 'AQS_RCH_CSO_CST';
  }
}
