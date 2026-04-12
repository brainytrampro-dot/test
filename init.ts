import { CdkStepper } from '@angular/cdk/stepper';
import { AfterViewInit, Component, EventEmitter, Injector, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  Validators,
  ValidatorFn,
  ValidationErrors
} from '@angular/forms';
import {
  ActivitySector,
  ActivitySectorType,
  CodeLabel,
  CustomerData,
  DelayType,
  DossierData,
  Products, PropertyData,
  PropertyType,
  RefCity,
  WarrantyType,
} from '@core/models';
import { Observable, Subject, Subscription } from 'rxjs';
import { map, skip, take } from 'rxjs/operators';
import { BaseComponent } from '@shared/components';
import { Guarantor } from '@core/models/guarantor';
import { DossierDataService, DossierDataStoreService, ReferentialService } from '@core/services';
import { SelectSearchService } from '@loan-dossier/services/select.service';
import { ObjectUtils } from '@core/util';
import { DialogMessageService, NumberValidators } from '@octroi-credit-common';
import { AccordType } from '@core/models/Accord';
import { convertFormValuesToDossierData } from '@loan-dossier/mapper/dossier-data-mapper';
import { RefCustomerProfession } from '@core/models/RefCustomerProfession';
import { Status } from '@loan-dossier/constants';

@Component({
  selector: 'app-initiation-stepper',
  templateUrl: './initiation-stepper.component.html',
  styleUrls: ['./initiation-stepper.component.scss'],
})
export class InitiationStepperComponent extends BaseComponent implements OnInit, AfterViewInit, OnDestroy {
  dossierData!: DossierData;
  formGroup!: FormGroup;
  loanDataFormGroup!: FormGroup;
  propertyData!: FormGroup;
  insuranceDataFormGroup!: FormGroup;
  customerDataFormGroup!: FormGroup;
  propertyDataNotaryFormGroup!: FormGroup;
  isProspect: boolean = false;
  activitySector$?: Observable<CodeLabel[]>;
  cities$?: Observable<RefCity[]>;
  activitiesSectors$!: Observable<ActivitySector[]>;
  addGuarantorEnabled: boolean = false;
  representativeFormDisplayed: boolean = false;
  savedGuarantors: Guarantor[] = [];
  stepsVisited: boolean[] = [true, ...new Array(6).fill(false)];
  patchedForm: boolean = false;
  dossierSavedSubject: Subject<boolean> = new Subject();
  dossierSaved$: Observable<Boolean> = this.dossierSavedSubject.asObservable();
  dossierStoreSubscription!: Subscription;
  delayTypes$?: Observable<DelayType[]>;
  customerHasNonSegement:boolean=false;
  showContractType:boolean=false;
  cityFilterControl=new FormControl();
  sectorActivityFilterControl=new FormControl;
  accord: string | undefined;
  filteredCities$?: Observable<RefCity[]>;
  filteredActivitiesSectors$?: Observable<ActivitySector[]>;
  professions$?: Observable<RefCustomerProfession[]>;
  filteredProfessions$?: Observable<RefCustomerProfession[]>;
  professionFilterControl = new FormControl();
  showProfessionList:boolean = false;
  showSeparation:boolean = false;
  isClientMRE:boolean=false;
  segmentClient!:string;
  prospect: boolean | undefined;
  filteredPropertyTypes$?: Observable<DelayType[]>;
  propertyTypes$!: Observable<PropertyType[]>;
  propertyTypeFilterControl=new FormControl();
  accountFilterControl = new FormControl('');

  @Output() goToloanHistoryStep=new EventEmitter<any>();
  @Output() validation = new EventEmitter<any>();
  @ViewChild('principalStepper') principalStepper!: CdkStepper;

  constructor(
    public dossierStore: DossierDataStoreService,
    public dossierDataService: DossierDataService,
    public refService: ReferentialService,
    public selectService:SelectSearchService,
    public dialogMessageService: DialogMessageService,
    injector: Injector
  ) {
    super(injector);
    this.activitiesSectors$ = this.refService.getAllActivitiesSectors();
    this.cities$ = this.refService.getCities();
    this.delayTypes$ = this.refService.mapToCodeDesignation(this.refService.getAllDelayTypes());

  }

  //TODO: [Urgent] To be refactored and split it to small methods and keep it simple and clean
  ngOnInit(): void {
    this.initForm();
    this.dossierStore.dossierData$.pipe(take(1)).subscribe(dossierData => {
      this.refService.getAllPropertyTypes();
      this.dossierData= dossierData;
      this.showContractType= dossierData.codeStatus !== Status.ADDITIONAL_AGENCY_INFORMATION_VALIDATION;
      this.patchedForm = true;
      if (dossierData.uuid) { this.stepsVisited = new Array(7).fill(true); }
      if (dossierData.representative) {
        this.representativeFormDisplayed = Object.keys(dossierData.representative).length > 0 && ObjectUtils.isAllFieldsNotEmpty(dossierData.representative);
      }
      const market = dossierData.customerData?.personalInfo?.market?.slice(-1);
      const segementClient=dossierData.customerData?.personalInfo?.segment;
      const isMRE=dossierData.customerData?.personalInfo?.country !== "MAROC";
      this.isClientMRE=isMRE;
      this.segmentClient=segementClient!;
    
      if(market==='9' &&  (!segementClient || !(segementClient?.includes("CLIPRI") && segementClient?.includes("CLIPRO")) )){
        this.customerHasNonSegement=true;
      }
      const marketitem = dossierData.customerData?.personalInfo?.market?.split('/')[1];
      switch (marketitem) {
        case '01': {
          this.activitySector$ = this.refService.mapToCodeDesignation(this.filterByType(ActivitySectorType.CLIPRI));
          this.dossierStore.updateTypeClient("CLIPRI")
          this.showContractType= dossierData.codeStatus !== Status.ADDITIONAL_AGENCY_INFORMATION_VALIDATION;
          break;
        } case '09': {
          if( this.customerHasNonSegement)   this.dossierStore.updateTypeClient('')
          if(segementClient?.includes('CLIPRI')){
          this.activitySector$ = this.refService.mapToCodeDesignation(this.filterByType(ActivitySectorType.CLIPRI));
          this.dossierStore.updateTypeClient("CLIPRI")
          }else if(segementClient?.includes('CLIPRO')){
            this.activitySector$ = this.refService.mapToCodeDesignation(this.filterByType(ActivitySectorType.CLIPRO));
            this.dossierStore.updateTypeClient("CLIPRO")
          }
          break;
        }
        case '09PRI': {
          this.activitySector$ = this.refService.mapToCodeDesignation(this.filterByType(ActivitySectorType.CLIPRI));
          break;
        }
        case '09PRO': {
          this.activitySector$ = this.refService.mapToCodeDesignation(this.filterByType(ActivitySectorType.CLIPRO));
          break;
        }
        default: {
          this.activitySector$ = this.refService.mapToCodeDesignation(this.filterByType(ActivitySectorType.CLIPRO));
          this.dossierStore.updateTypeClient("CLIPRO")
          break;
        }
      }

      if(isMRE && market==='1'){
        this.customerHasNonSegement=true;
        this.dossierStore.updateTypeClient('')
      }
      if((segementClient?.includes('CLIPRO') || ['02','03','09PRO'].includes(marketitem!)) && isMRE==false){
             this.showProfessionList=true;
      }
      if((['03','02'].includes(marketitem!))){
          this.showSeparation=true;
      }
      this.updatePropertyData(dossierData, {});
      const cutomerType=dossierData.customerData?.personalInfo?.market?.includes("PRI")?'CLIPRI':'CLIPRO';
      this.professions$ = this.refService.getAllCustomerProfessions(cutomerType!);
    }
    );

    if(this.customerHasNonSegement){
      this.employerCutomerTypeControl?.addValidators([Validators.required]);
      this.employerCutomerTypeControl?.valueChanges.subscribe(value=>{
        if(value?.includes('CLIPRI')){
          this.activitySector$ = this.refService.mapToCodeDesignation(this.filterByType(ActivitySectorType.CLIPRI));
          this.dossierStore.updateTypeClient("CLIPRI")
          this.showProfessionList=false
          }else{
            this.activitySector$ = this.refService.mapToCodeDesignation(this.filterByType(ActivitySectorType.CLIPRO));
            this.dossierStore.updateTypeClient("CLIPRO")
            if(this.isClientMRE==false && !this.separation){
              this.showProfessionList=true;
            }
          }
      })
    }else{
      this.employerCutomerTypeControl?.removeValidators([Validators.required]);
      this.employerCutomerTypeControl?.reset();
    }

    this.dossierStoreSubscription = this.dossierStore.dossierData$.pipe(skip(1)).subscribe(dossierData => {
      this.dossierData= dossierData;
      if(dossierData.changeToSave){
        this.onSave(convertFormValuesToDossierData(this.formGroupRawValue, dossierData));
      }
    });

    if(this.showContractType){
      this.contractTypeControl.addValidators([Validators.required]);
    }

    this.filteredActivitiesSectors$= this.selectService.filterOptions(this.activitiesSectors$,this.sectorActivityFilterControl,'designation')
    this.filteredCities$= this.selectService.filterOptions(this.cities$ || [],this.cityFilterControl,'designation')
    this.filteredProfessions$= this.selectService.filterOptions(this.professions$ || [],this.professionFilterControl,'designation');
    this.dossierStore.typeClient$.subscribe(value=>{
      this.showContractType = value !== 'CLIPRO' &&
                      !["MCH/09PRO"].includes(this.dossierData.customerData?.personalInfo?.market!)
                    && this.dossierData.codeStatus !== Status.ADDITIONAL_AGENCY_INFORMATION_VALIDATION;
      if(!this.showContractType){
        this.contractTypeControl.removeValidators([Validators.required]);
        this.contractTypeControl.reset();
      }
    })
    this.updateNotaryValidations();

    this.contractTypeControl?.valueChanges.subscribe(value=>{
      if(value ==='CDI'){
        this.isTitularizedControl.addValidators([Validators.required]);
      }else{
        this.isTitularizedControl.removeValidators([Validators.required]);
        this.isTitularizedControl.reset();
      }
    })
  }

  ngAfterViewInit(): void {
    if (this.patchedForm) {
      const dossier = this.dossierStore.get();
      const isImtilak = [Products.IMTILAK.toString(), Products.IMTILAK_PPR.toString()].includes(dossier.product?.code!);
      const mechanisms = dossier.loanData?.mechanisms ?? [];
      const loanData = {...dossier.loanData, mechanisms: (isImtilak && mechanisms.length > 0) ? mechanisms[0]: mechanisms};
      this.initDelayedType(dossier);
      this.formGroup.patchValue({...dossier, loanData, personalInfo: dossier.customerData?.personalInfo});
      this.customerDataFormGroup?.updateValueAndValidity();
      this.propertyDataNotaryFormGroup?.updateValueAndValidity();
      this.employerFormGroup?.updateValueAndValidity();
      this.prospectFormGroup?.updateValueAndValidity();
    }


    this.getControlValueChanges(this.separationFormControl).subscribe(value=>{
      if (value === false && this.isClientMRE === false && (this.employerCutomerTypeControl?.value=='CLIPRO'||this.segmentClient?.includes('CLIPRO') )) {
      this.professionFormControl.addValidators(Validators.required);
      this.showProfessionList=true;
      }
      if(value === true){
        this.professionFormControl.removeValidators(Validators.required);
        this.professionFormControl.reset()
      }
    })
  }

  nextStep = () => {
    if(!this.customerHasNonSegement ||( this.customerHasNonSegement  && this.employerCutomerTypeControl?.valid)){
      this.principalStepper.next();
    }
  }

  previousStep = () => {
    this.principalStepper.previous();
  }

  update = () => {
    if(!this.customerHasNonSegement ||( this.customerHasNonSegement  && this.employerCutomerTypeControl?.valid)){
      const dossier = this.dossierStore.get();
      this.dossierStore.update({
        ...dossier,
        ...this.formGroupRawValue,
        customerData:{
          ...(dossier.customerData || {}),
          personalInfo:{
            ...(dossier.customerData?.personalInfo ||{}),
            ...(this.personalInfoFormGroup instanceof FormGroup ? this.personalInfoFormGroup.getRawValue(): {})
          }
        },
        warranties: dossier.warranties,
      });
    }
  }

  statmentValidation = () => {
    const isExternDebtsRetrieved=this.dossierStore.get()?.loanData?.isExternDebtsRetrieved;
    if(!isExternDebtsRetrieved && !this.isProspect){
      this.dialogMessageService.info({
        messageKey: 'loan.extern.dialog.demande.message',
        headerKey: 'loan.extern.dialog.demande.header',
        closeLabel: 'loan.extern.dialog.demande.close.label',
        afterCloseCallback: () => this.goToloanHistoryStep.emit(true),
      });
    }else{
      this.validation.emit(true);
    }
  }

  isStepCompleted(formGroup: AbstractControl, stepIndex: number) {
    return this.stepsVisited[stepIndex] && formGroup?.valid
  }

  isStepHasError(formGroup: AbstractControl, stepIndex: number) {
    return this.stepsVisited[stepIndex] && !formGroup?.valid
  }

  onSave(dossierPayload: DossierData) {
      const errors: any[] = [];
      this.calculateFormValidationErrors(this.formGroup, errors);
    if (!errors.find(error => error.errorName != 'required')) {
        this.dossierDataService.save(dossierPayload)
        .subscribe({
          next: savedDossier => this.postSave(dossierPayload, savedDossier),
          complete: () => {
            this.dossierSavedSubject.next(true);
            this.showSuccessMessage({ bodyKey: "loan.save.success.message" });
            this.changeDetectorRef.detectChanges();
          }
        });
    } else {
      const errorMessage = errors
      .filter(({ errorName }) => errorName !== 'required')
      .map(({ controlName }) => controlName)
      .join('\n');

      this.showErrorMessage({ bodyKey: errorMessage });

    }
  }

  postSave(dossierPayload: any, savedDossier: any) {
    this.updateLoanData(dossierPayload,savedDossier);
    this.updatePropertyData(dossierPayload,savedDossier);
    this.dossierStore.update({warranties: savedDossier.warranties}, true, false);

    if (!dossierPayload.uuid) {
      let dossierData:any = {
        uuid: savedDossier.uuid,
        codeDossier: savedDossier.codeDossier,
        dossierUsers:savedDossier.dossierUsers,
        assignee:savedDossier.assignee
      }
        const customerData= {
          ...this.dossierStore.get()?.customerData,
          personalInfo:{
            ...this.dossierStore.get()?.customerData?.personalInfo,
            market:savedDossier?.customerData?.personalInfo.market},
            prospect: savedDossier?.customerData?.prospect,
            ...(savedDossier?.customerData?.balanceActivity
               && { balanceActivity: savedDossier.customerData.balanceActivity })
        } as CustomerData
        dossierData ={...dossierData, customerData}


      this.dossierStore.update(dossierData,true,false);
      if(dossierPayload?.employer?.cutomerType){
        this.dossierStore.updateTypeClient(dossierPayload?.employer?.cutomerType)
      }
    }
  }

  /**
   * The purpose of this method is to change same attribute in Loan data
   * in the backend
   * @param dossierPayload Dossier data comes from front end
   * @param savedDossier Dossier data saved & returned from back end
   */
  updateLoanData(dossierPayload:any,savedDossier: any) {
    let oldLoanData = dossierPayload.loanData;
    let newLoanData = {
      ...oldLoanData,
      debtRatio : savedDossier?.loanData?.debtRatio,
      isExternDebtsRetrieved: savedDossier?.loanData?.isExternDebtsRetrieved,
      isExternDebtsInfnRetrieved : savedDossier?.loanData?.isExternDebtsInfnRetrieved
    }
    this.dossierStore.update({ loanData: newLoanData }, false);
    this.loanDataFormGroup?.get('debtRatio')?.setValue(savedDossier?.loanData?.debtRatio);
    this.loanDataFormGroup?.get('isExternDebtsRetrieved')?.setValue(savedDossier?.loanData?.isExternDebtsRetrieved);
    this.loanDataFormGroup?.get('isExternDebtsInfnRetrieved')?.setValue(savedDossier?.loanData?.isExternDebtsInfnRetrieved);
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

  compareObjects(o1: any, o2: any): boolean {
    return o1?.code === o2?.code
  }

  onSelectionChange(event: any) {
    this.stepsVisited[event.selectedIndex] = true;
    this.dossierStore.update(this.formGroupRawValue);
  }

  validateProspectData() {
    return this.dossierStore.get()?.customerData?.personalInfo?.prospect;
  }

  isStepValid(formGroup: AbstractControl) {
    return !this.isFormHasFunctionalErrors(formGroup as FormGroup);
  }

  isControlHasFunctionalErrors(formGroup: AbstractControl) {
    return this.isFormHasFunctionalErrors(formGroup as FormGroup);
  }

  activateRepresentativeForm(event: any) {
    this.representativeFormDisplayed = event.target.checked;
    if (event.target.checked) {
      this.representativeLastname.addValidators(Validators.required);
      this.representativeFirstName.addValidators(Validators.required);
      this.representativeCIN.addValidators(Validators.required);
      this.representativeCinIssuedAt.addValidators(Validators.required);
    } else {
      this.representativeLastname.removeValidators(Validators.required);
      this.representativeLastname.reset();
      this.representativeFirstName.removeValidators(Validators.required);
      this.representativeFirstName.reset();
      this.representativeCIN.removeValidators(Validators.required);
      this.representativeCIN.reset();
      this.representativeCinIssuedAt.removeValidators(Validators.required);
      this.representativeCinIssuedAt.reset();
      this.representativeFormGroup.reset();
    }
  }

  ngOnDestroy(): void {
    this.dossierStoreSubscription.unsubscribe();
  }

  getTomorrow(fromDate?: Date): Date {
    const baseDate = fromDate ? new Date(fromDate) : new Date();
    baseDate.setDate(baseDate.getDate() + 1);
    return baseDate;
  }

  private initDelayedType(dossierPayload: DossierData) {
    let pCode = dossierPayload?.product?.code;
    if (pCode === Products.PPI_PPR_FONC.toString()) {
      this.delayTypes$?.subscribe(dts => {
        let capitalInteretsType = dts.find(dt => dt.code === "CAPITAL_INTERETS")
        if (capitalInteretsType) {
          this.loanDataFormGroup?.get('delayed')?.setValue(true);
          this.loanDataFormGroup?.get('delayed')?.disable();
          this.loanDataFormGroup?.get('delayType')?.setValue({ code: capitalInteretsType.code, label: capitalInteretsType.designation });
          this.loanDataFormGroup?.get('delayType')?.disable();
          this.loanDataFormGroup?.get('delayDuration')?.setValue(2);
          this.loanDataFormGroup?.get('delayDuration')?.disable();
        }
      });
    }
  }

  private initForm( ) {
    this.formGroup = this.formBuilder.group({
      personalInfo: this.buildProspectFormGroup(),
      employer: this.formBuilder.group({
        activitySector: new FormControl(null, [Validators.required]),
        cutomerType: new FormControl(),
        contractType: new FormControl(),
        isTitularized: new FormControl(false),
        name: new FormControl(null, [Validators.required]),
        address: new FormControl(null),
        separation: new FormControl(true, [Validators.required]),
        profession: new FormControl(),
        phone: new FormControl(null, [Validators.pattern('^(0[0-9]{9}|\\+?[1-9]\\d{1,14})$')
        ]),
      }),
      financialData: this.formBuilder.group({
        income: new FormControl(null, [Validators.required]),
        spouseIncome: new FormControl(),
        otherIncome: new FormControl(),
        rentalIncome: new FormControl(),
        familyAllowance: new FormControl(),
        pension: new FormControl(),
        dividends: new FormControl(),
      }),
      guarantors: this.formBuilder.array([]),
      warranties: this.formBuilder.array([], this.minLengthArray(1)),
      beneficiaries: this.formBuilder.array([], this.minLengthArray(1)),
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
      representative: this.formBuilder.group({
        lastname: new FormControl(),
        firstname: new FormControl(),
        cin: new FormControl(),
        cinIssuedAt: new FormControl(),
      }),
      loanData: this.formBuilder.group({}),
      insuranceData: this.formBuilder.group({})
    });
    this.loanDataFormGroup = this.formGroup.get('loanData')! as FormGroup;
    this.insuranceDataFormGroup = this.formGroup.get('insuranceData') as FormGroup;

    /** for regrouping employer & financialData only in front presentation**/
    this.customerDataFormGroup = this.formBuilder.group({});
    this.customerDataFormGroup.addControl('employer', this.formGroup.get('employer') as FormGroup);
    this.customerDataFormGroup.addControl('financialData', this.formGroup.get('financialData') as FormGroup);
    this.customerDataFormGroup.addControl('personalInfo', this.formGroup.get('personalInfo') as FormGroup);


    /** for regrouping notary & propertyData only in front presentation**/
    this.propertyDataNotaryFormGroup = this.formBuilder.group({});
    this.propertyDataNotaryFormGroup.addControl('notary', this.formGroup.get('notary') as FormGroup);
    this.propertyData = this.formGroup.get('propertyData')! as FormGroup;
  }



  private updateNotaryValidations() {
    if (!this.notaryFormGroup || !this.propertyDataFormGroup) return;

    if (this.fieldsClearingCondition('Notary')) {
      this.clearNotaryFieldValidators();
    }

    this.notaryMailFormControl.updateValueAndValidity();
    this.notaryPhoneFormControl.updateValueAndValidity();
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

  private fieldsClearingCondition(fileds:'Notary'): boolean {
    const dossier = this.dossierStore.get();
    this.accord= dossier?.accord;
    this.isProspect=!!dossier?.customerData?.personalInfo?.prospect;
    const product= dossier.product?.code

    const allowedCodesByField: Record<typeof fileds, string[]> = {
      Notary:   [Products.MOULKIA.toString(),Products.PPI_VEFA.toString()]
    };

    return (
      this.accord === AccordType.PRINCIPE ||
      this.isProspect ||
      allowedCodesByField[fileds].includes(product!)
    );
  }

  private filterByType(type: ActivitySectorType): Observable<ActivitySector[]> {
    return this.activitiesSectors$.pipe(
      map((aSectors) =>
        aSectors.filter((as) => as.type == ActivitySectorType[type])
      )
    );
  }

  private minLengthArray(min: number): ValidatorFn {
    return (control: AbstractControl): {[key: string]: any} | null => {
      if(control.value && control.value.length >= min){
        return null;
      }
      return { minLengthArray: { valid: false, requiredLength: min, actualLength: control.value.length}};
    }
  }

  private ageValidator(control: AbstractControl): ValidationErrors | null {
    if (!control.value) {
      return null;
    }

    const birthDate = new Date(control.value);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();

    if (
      today.getMonth() < birthDate.getMonth() ||
      (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate())
    ) {
      age--;
    }

    return age <= 70 ? null : { ageLimitExceeded: true };
  }

  private buildProspectFormGroup(): FormGroup | undefined{
    const dossier = this.dossierStore.get();
    const isProspect = dossier.customerData?.personalInfo?.prospect;
    if(!isProspect) return;
    const prospectForm = this.formBuilder.group({
      lastName:  new FormControl(null, [Validators.required]),
      firstName:  new FormControl(null, [Validators.required]),
      lastProfession: new FormControl(null, [Validators.required]),
      legalStatus:  new FormControl(null, [Validators.required]),
      maritalStatus:  new FormControl(null, [Validators.required]),
      cardID:  new FormControl(null, [Validators.required]),
      cardIDEmissionDate:  new FormControl(null, [Validators.required]),
      cardIDExpirationDate: new FormControl(null, [Validators.required]),
      cardType:   new FormControl(null, [Validators.required]),
      birthDate: new FormControl(null, [Validators.required, this.ageValidator]),
      address1: new FormControl(null, [Validators.required]),
      phone: new FormControl(null, [ Validators.required,Validators.pattern('^(0[0-9]{9}|\\+?[1-9]\\d{1,14})$')]),
      topFonctionnaire: new FormControl(false),
      sexe: new FormControl(null, [Validators.required]),
      pprFonctionnaire: new FormControl(),
      nationalityCountry: new FormControl(null, [Validators.required]),
      residenceCountry: new FormControl(null, [Validators.required])
    });
    prospectForm.get("lastProfession")?.valueChanges.subscribe((value) => {
      const isFonctionnaire = value && value === "TOP_FONCTIONNAIRE";
      prospectForm.get("topFonctionnaire")?.setValue(isFonctionnaire);
      if(isFonctionnaire){
        prospectForm.get("pprFonctionnaire")?.addValidators([Validators.required]);
      }else{
        prospectForm.get("pprFonctionnaire")?.reset();
        prospectForm.get("pprFonctionnaire")?.clearValidators();
      }
    });
    return prospectForm;
  }

  get ProspectPhoneControl(): FormControl{
    return this.personalInfoFormGroup.get('phone') as FormControl;
  }

  get formGroupRawValue(): any {
    return this.formGroup.getRawValue();
  }

  get prospectFormGroup(): AbstractControl{
    return this.formGroup.get('prospect')!;
  }

  get employerFormGroup(): AbstractControl {
    return this.formGroup.get('employer')!;
  }

  get financialData(): FormGroup {
    return this.formGroup.get('financialData') as FormGroup;
  }
    get incomeControl(): AbstractControl {
    return this.financialData?.get('income') as FormControl;
  }

  get employerPhoneControl(): AbstractControl {
    return this.employerFormGroup.get('phone') as FormControl;
  }

  get employerCutomerTypeControl(): AbstractControl {
    return this.employerFormGroup?.get('cutomerType') as FormControl;
  }

  get contractTypeControl(): AbstractControl {
    return this.employerFormGroup?.get('contractType') as FormControl;
  }
  get isTitularizedControl(): AbstractControl {
    return this.employerFormGroup?.get('isTitularized') as FormControl;
  }
  get contratType() {
    return this.contractTypeControl?.value;
  }

  get separationFormControl() {
    return this.employerFormGroup.get('separation') as FormControl;
  }

  get professionFormControl() {
    return this.employerFormGroup.get('profession') as FormControl;
  }

  get separation() {
    return this.employerFormGroup?.get('separation')?.value;
  }

  get financialDataFormGroup(): AbstractControl {
    return this.formGroup.get('financialData')!;
  }

  get propertyDataFormGroup(): FormGroup {
    return this.formGroup.get('propertyData') as FormGroup;
  }

  get notaryFormGroup(): AbstractControl {
    return this.formGroup.get('notary')!;
  }

  get notaryMailFormControl(): FormControl {
    return this.notaryFormGroup.get('email') as FormControl;
  }

  get notaryPhoneFormControl(): FormControl {
    return this.notaryFormGroup.get('phone') as FormControl;
  }

  get guarantorsFormArray(): FormArray {
    return this.formGroup.controls['guarantors'] as FormArray;
  }

  get warrantiesFormArray(): FormArray {
    return this.formGroup.controls['warranties'] as FormArray;
  }

  get beneficiariesFormArray(): FormArray {
    return this.formGroup.controls['beneficiaries'] as FormArray;
  }

  get representativeLastname(): FormControl {
    return this.representativeFormGroup.get('lastname') as FormControl;
  }

  get representativeFirstName(): FormControl {
    return this.representativeFormGroup.get('firstname') as FormControl;
  }

  get representativeCIN(): FormControl {
    return this.representativeFormGroup.get('cin') as FormControl;
  }

  get representativeCinIssuedAt(): FormControl {
    return this.representativeFormGroup.get('cinIssuedAt') as FormControl;
  }

  get representativeFormGroup(): FormGroup {
    return this.formGroup.get('representative') as FormGroup;
  }

  get personalInfoFormGroup(): FormGroup {
    return this.formGroup.get('personalInfo') as FormGroup;
  }
}
