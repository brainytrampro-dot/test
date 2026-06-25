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
  propertyData!: FormGroup;
  customerDataFormGroup!: FormGroup;
  propertyDataNotaryFormGroup!: FormGroup;
  isProspect: boolean = false;
  activitySector$?: Observable<CodeLabel[]>;
  cities$?: Observable<RefCity[]>;
  activitiesSectors$!: Observable<ActivitySector[]>;
  addGuarantorEnabled: boolean = false;
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
    this.dossierStore.update({
      warranties: savedDossier.warranties,
      propertyData: savedDossier.propertyData,
      beneficiaries: savedDossier.beneficiaries,
    }, true, false);

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

    this.dossierData= {...savedDossier};
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

  ngOnDestroy(): void {
    this.dossierStoreSubscription.unsubscribe();
  }

  getTomorrow(fromDate?: Date): Date {
    const baseDate = fromDate ? new Date(fromDate) : new Date();
    baseDate.setDate(baseDate.getDate() + 1);
    return baseDate;
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
      representatives: this.formBuilder.array([]),
      loanData: this.formBuilder.group({}),
      insuranceData: this.formBuilder.group({})
    });

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


  private fieldsClearingCondition(fileds: 'Notary' | 'Beneficiary'): boolean {
    const dossier = this.dossierStore.get();
    this.accord = dossier?.accord;
    this.isProspect = !!dossier?.customerData?.personalInfo?.prospect;
    const product = dossier.product?.code;

    const allowedCodesByField: Record<typeof fileds, string[]> = {
      Notary:      [Products.MOULKIA.toString(), Products.PPI_VEFA.toString()],
      Beneficiary: []  // facultatif uniquement pour prospect et accord principe
    };

    return (
      this.accord === AccordType.PRINCIPE ||
      this.isProspect ||
      allowedCodesByField[fileds].includes(product!)
    );
  }

  private updateNotaryValidations() {
    if (!this.notaryFormGroup || !this.propertyDataFormGroup) return;

    if (this.fieldsClearingCondition('Notary')) {
      this.clearNotaryFieldValidators();
    }

    if (this.fieldsClearingCondition('Beneficiary')) {
      this.clearBeneficiaryValidators();
    } else {
      this.restoreBeneficiaryValidators();
    }

    this.notaryMailFormControl.updateValueAndValidity();
    this.notaryPhoneFormControl.updateValueAndValidity();
    this.notaryFormGroup.get('name')?.updateValueAndValidity();
    this.notaryFormGroup.get('address')?.updateValueAndValidity();
    this.beneficiariesFormArray.updateValueAndValidity();
  }

  private clearBeneficiaryValidators(): void {
    this.beneficiariesFormArray.clearValidators();
    this.beneficiariesFormArray.updateValueAndValidity();
  }

  private restoreBeneficiaryValidators(): void {
    this.beneficiariesFormArray.setValidators(this.minLengthArray(1));
    this.beneficiariesFormArray.updateValueAndValidity();
  }

  private clearNotaryFieldValidators(): void {
    this.notaryMailFormControl.clearValidators();
    this.notaryPhoneFormControl.clearValidators();
    this.notaryMailFormControl.addValidators([Validators.email]);
    this.notaryPhoneFormControl.addValidators([Validators.pattern('^(0[0-9]{9}|\\+?[1-9]\\d{1,14})$')]);
    this.notaryFormGroup.get('name')?.clearValidators();
    this.notaryFormGroup.get('address')?.clearValidators();
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

  // ------------ Getters -----------------
  get formGroupRawValue(): any {                      return this.formGroup.getRawValue(); }
  get separation() {                                  return this.employerFormGroup?.get('separation')?.value; }

  get ProspectPhoneControl(): FormControl{            return this.personalInfoFormGroup.get('phone') as FormControl; }
  get incomeControl(): AbstractControl {              return this.financialData?.get('income') as FormControl; }
  get employerPhoneControl(): AbstractControl {       return this.employerFormGroup.get('phone') as FormControl; }
  get employerCutomerTypeControl(): AbstractControl { return this.employerFormGroup?.get('cutomerType') as FormControl; }
  get contractTypeControl(): AbstractControl {        return this.employerFormGroup?.get('contractType') as FormControl; }
  get isTitularizedControl(): AbstractControl {       return this.employerFormGroup?.get('isTitularized') as FormControl; }
  get separationFormControl() {                       return this.employerFormGroup.get('separation') as FormControl; }
  get professionFormControl() {                       return this.employerFormGroup.get('profession') as FormControl; }
  get notaryMailFormControl(): FormControl {          return this.notaryFormGroup.get('email') as FormControl; }
  get notaryPhoneFormControl(): FormControl {         return this.notaryFormGroup.get('phone') as FormControl; }

  get financialData(): FormGroup {                    return this.formGroup.get('financialData') as FormGroup; }
  get propertyDataFormGroup(): FormGroup {            return this.formGroup.get('propertyData') as FormGroup;}
  get personalInfoFormGroup(): FormGroup {            return this.formGroup.get('personalInfo') as FormGroup;}

  get loanDataFormGroup (): FormGroup {              return this.formGroup.get('loanData')! as FormGroup;}
  get insuranceDataFormGroup (): FormGroup {         return this.formGroup.get('insuranceData') as FormGroup;}
  get prospectFormGroup(): AbstractControl{           return this.formGroup.get('prospect')!; }
  get employerFormGroup(): AbstractControl {          return this.formGroup.get('employer')!; }
  get contratType() {                                 return this.contractTypeControl?.value; }
  get financialDataFormGroup(): AbstractControl {     return this.formGroup.get('financialData')!; }
  get notaryFormGroup(): AbstractControl {            return this.formGroup.get('notary')!; }
  get guarantorsFormArray(): FormArray {              return this.formGroup.controls['guarantors'] as FormArray; }
  get warrantiesFormArray(): FormArray {              return this.formGroup.controls['warranties'] as FormArray;}
  get beneficiariesFormArray(): FormArray {           return this.formGroup.controls['beneficiaries'] as FormArray;}
  get representativesFormArray(): FormArray {         return this.formGroup.controls['representatives'] as FormArray;}
}




<form [formGroup]="formGroup" autocomplete="off" class="initiation-form">
  <app-stepper #principalStepper linear="false" (selectionChange)="onSelectionChange($event)" [showIndicator]="false" [showNavigationButtons]="false">
    <ng-template #additionalActions>
      <div class="dossierNumber">
        <img src="../../../../assets/svg/dossierNumber.svg" width="20" alt="dossier Number" />
        <span *ngIf="dossierData?.codeDossier">N°{{dossierData?.codeDossier}}</span>
      </div>
    </ng-template>
    <cdk-step [stepControl]="customerDataFormGroup" [completed]="isStepCompleted(customerDataFormGroup, 0)" [hasError]="isStepHasError(customerDataFormGroup, 0)">
      <ng-template cdkStepLabel>
        <span>{{"customer.loan.initiation.steps.customerdata.label" | translate}}</span>
      </ng-template>
      <app-stepper [nextFunction]="update" [doneFunction]="nextStep" [firstPreviousFunction]="previousStep"
        [showNavigationList]="false" doneButtonLabel="Suivant" [disableFirstStepPreviousButton]="true" [disabledDoneButton]="customerHasNonSegement && !employerCutomerTypeControl.valid">
        <cdk-step *ngIf="isProspect" formGroupName="personalInfo" [stepControl]="personalInfoFormGroup">
          <div class="step-header">
            <div class="step-title-container">
              <div class="step-visual">
                <img src="../../../../assets/img/steps/client-informations.svg" width="217" alt="Données Prospect">
              </div>
              <div class="step-title-wrapper">
                <h2 class="step-title"> {{"prospect.perspnalInfo.label" | translate }} </h2>
                <p class="step-description"> {{"prospect.loan.initiation.steps.customerdata.description1" | translate }} </p>
              </div>
            </div>
          </div>
          <div class="step-form">
            <div class="stepper-content-body">
              <div class="step-form-container">
                <div class="row">
                  <div class="col">
                    <div class="form-control-wrapper">
                      <label class="form-control-label">{{ "personalInfo.firstName" | translate }}</label>
                      <div class="form-control-container">
                        <input class="form-control-input" type="text" formControlName="firstName" />
                      </div>
                    </div>
                  </div>
                </div>
                <div class="row">
                  <div class="col">
                    <div class="form-control-wrapper">
                      <label class="form-control-label">{{ "personalInfo.lastName" | translate }}</label>
                      <div class="form-control-container">
                        <input class="form-control-input" type="text" formControlName="lastName" />
                      </div>
                    </div>
                  </div>
                </div>
                <div class="row">
                  <div class="col">
                    <div class="form-control-wrapper">
                      <label class="form-control-label">{{ "personalInfo.legalStatus" | translate }}<span>*</span></label>
                      <div class="form-control-container">
                        <mat-select formControlName="legalStatus"  placeholder="choisissez votre statut legal"
                          >
                            <mat-option value="MAJEUR">{{ "Majeur" | translate}}</mat-option>
                            <mat-option value="MINEUR">{{ "Mineur" | translate}}</mat-option>
                        </mat-select>
                      </div>
                      <div class="error-container" *ngIf="personalInfoFormGroup.get('legalStatus')?.touched && personalInfoFormGroup.get('legalStatus')?.hasError('required')">
                      <span>{{"field.requierd.error.message" | translate}}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="row">
                  <div class="col">
                    <div class="form-control-wrapper">
                      <label class="form-control-label">{{ "personalInfo.sexe" | translate }}<span>*</span></label>
                      <div class="form-control-container">
                        <mat-select formControlName="sexe"  placeholder="Genre">
                            <mat-option value="MALE">{{ "Homme" | translate}}</mat-option>
                            <mat-option value="FEMALE">{{ "Femme" | translate}}</mat-option>
                        </mat-select>
                      </div>
                      <div class="error-container" *ngIf="personalInfoFormGroup.get('sexe')?.touched && personalInfoFormGroup.get('sexe')?.hasError('required')">
                      <span>{{"field.requierd.error.message" | translate}}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="row">
                    <div class="col">
                      <mat-form-field class="matselectsearch-dialog matselectsearch">
                        <mat-label class="form-control-label">{{ "personalInfo.profession" | translate }}<span>*</span></mat-label>
                        <div class="form-control-container" >
                          <mat-select formControlName="lastProfession" disableOptionCentering>
                            <mat-option>
                              <ngx-mat-select-search [formControl]="professionFilterControl"
                                                     [placeholderLabel]="'Recherche ici'"
                                                     [noEntriesFoundLabel]="'Aucun element correspondant trouvé'" ngDefaultControl>
                              </ngx-mat-select-search>
                              <span class="icon-search-select"></span>
                            </mat-option>
                            <mat-option *ngFor="let prof of filteredProfessions$ | async" [value]="prof?.code">
                              {{ prof.designation }}
                            </mat-option>
                          </mat-select>
                        </div>
                      </mat-form-field>
                    </div>
                </div>
                <div class="row" *ngIf="personalInfoFormGroup.get('topFonctionnaire')?.value === true">
                    <div class="col">
                      <div class="form-control-wrapper">
                        <label class="form-control-label">{{ "PPR Fonctionnaire" | translate }}</label>
                        <div class="form-control-container">
                          <input class="form-control-input" type="text" formControlName="pprFonctionnaire" />
                        </div>
                         <div class="error-container" *ngIf="personalInfoFormGroup.get('pprFonctionnaire')?.touched &&
                        personalInfoFormGroup.get('pprFonctionnaire')?.hasError('required')">
                        <span>{{"field.requierd.error.message" | translate}}</span>
                        </div>
                      </div>
                    </div>
                </div>
                <div class="row">
                    <div class="col">
                      <div class="form-control-wrapper">
                        <label class="form-control-label">{{ "Nationnalité" | translate }}</label>
                        <div class="form-control-container">
                          <input class="form-control-input" type="text" formControlName="nationalityCountry" />
                        </div>
                         <div class="error-container" *ngIf="personalInfoFormGroup.get('nationalityCountry')?.touched &&
                        personalInfoFormGroup.get('nationalityCountry')?.hasError('required')">
                        <span>{{"field.requierd.error.message" | translate}}</span>
                        </div>
                      </div>
                    </div>
                </div>
                <div class="row">
                    <div class="col">
                      <div class="form-control-wrapper">
                        <label class="form-control-label">{{ "Pays de résidence" | translate }}</label>
                        <div class="form-control-container">
                          <input class="form-control-input" type="text" formControlName="residenceCountry" />
                        </div>
                        <div class="error-container" *ngIf="personalInfoFormGroup.get('residenceCountry')?.touched &&
                        personalInfoFormGroup.get('residenceCountry')?.hasError('required')">
                        <span>{{"field.requierd.error.message" | translate}}</span>
                        </div>
                      </div>
                    </div>
                </div>
                <div class="row">
                    <div class="col">
                      <div class="form-control-wrapper">
                        <label class="form-control-label">{{ "personalInfo.maritalStatus" | translate }}<span>*</span></label>
                        <div class="form-control-container">
                          <mat-select formControlName="maritalStatus"  placeholder="choisissez votre status marital"
                            >
                              <mat-option value="MARIE">{{ "MARIE" | translate}}</mat-option>
                              <mat-option value="CELIBATAIRE">{{ "CELIBATAIRE" | translate}}</mat-option>
                              <mat-option value="VEUF">{{ "VEUF" | translate}}</mat-option>
                              <mat-option value="VEUVE">{{ "VEUVE" | translate}}</mat-option>
                          </mat-select>
                        </div>
                        <div class="error-container" *ngIf="personalInfoFormGroup.get('maritalStatus')?.touched &&
                        personalInfoFormGroup.get('maritalStatus')?.hasError('required')">
                        <span>{{"field.requierd.error.message" | translate}}</span>
                        </div>
                      </div>
                    </div>
                </div>
                <div class="row">
                  <div class="col">
                    <div class="form-control-wrapper">
                      <label class="form-control-label">{{ "personalInfo.cardType" | translate }}<span>*</span></label>
                      <div class="form-control-container">
                        <mat-select formControlName="cardType"  placeholder="choisissez votre pièce d'dentité"
                          >
                            <mat-option value="CIN">{{ "CIN" | translate}}</mat-option>
                            <mat-option value="PASSEPORT">{{ "PASSEPORT" | translate}}</mat-option>
                        </mat-select>
                      </div>
                      <div class="error-container" *ngIf="personalInfoFormGroup.get('personalInfo.cardType')?.touched &&
                      personalInfoFormGroup.get('personalInfo.cardType')?.hasError('required')">
                      <span>{{"field.requierd.error.message" | translate}}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="row">
                    <div class="col">
                      <div class="form-control-wrapper">
                        <label class="form-control-label">{{ "personalInfo.cardID" | translate }}</label>
                        <div class="form-control-container">
                          <input class="form-control-input" type="text" formControlName="cardID" />
                        </div>
                      </div>
                    </div>
                </div>
                <div class="row">
                    <div class="col">
                      <div class="form-control-wrapper">
                        <label class="form-control-label">{{ "personalInfo.cardIDEmissionDate" | translate }}</label>
                        <div class="form-control-container">
                          <input
                            class="form-control-input"
                            (dateChange)="changeDatePicker(personalInfoFormGroup.get('cardIDEmissionDate'))"
                            [matDatepicker]="cardIDEmissionDatePicker" formControlName="cardIDEmissionDate"
                            placeholder="{{'date.format.placeholder' | translate}}"
                            (focus)="cardIDEmissionDatePicker.open()" />
                          <mat-datepicker-toggle matSuffix [for]="cardIDEmissionDatePicker">
                            <mat-icon matDatepickerToggleIcon>
                              <img src="/assets/svg/calendar.svg" alt="sgma">
                          </mat-icon>
                          </mat-datepicker-toggle>
                          <mat-datepicker #cardIDEmissionDatePicker></mat-datepicker>
                        </div>
                      </div>
                    </div>
                </div>
                <div class="row">
                  <div class="col">
                    <div class="form-control-wrapper">
                      <label class="form-control-label">{{ "personalInfo.cardIDExpirationDate" | translate }}</label>
                      <div class="form-control-container">
                        <input
                          class="form-control-input"
                          (dateChange)="changeDatePicker(personalInfoFormGroup.get('cardIDExpirationDate'))"
                          [matDatepicker]="cardIDExpirationDatePicker" formControlName="cardIDExpirationDate"
                          placeholder="{{'date.format.placeholder' | translate}}"
                          (focus)="cardIDExpirationDatePicker.open()" [min]="getTomorrow(dossierData?.createdAt)"/>
                        <mat-datepicker-toggle matSuffix [for]="cardIDExpirationDatePicker">
                          <mat-icon matDatepickerToggleIcon>
                            <img src="/assets/svg/calendar.svg" alt="sgma">
                        </mat-icon>
                        </mat-datepicker-toggle>
                        <mat-datepicker #cardIDExpirationDatePicker ></mat-datepicker>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="row">
                  <div class="col">
                    <div class="form-control-wrapper">
                      <label class="form-control-label">{{ "personalInfo.birthDate" | translate}}</label>
                      <div class="form-control-container">
                        <input
                          class="form-control-input"
                          (dateChange)="changeDatePicker(personalInfoFormGroup.get('birthDate'))"
                          [matDatepicker]="birthDatePicker" formControlName="birthDate"
                          placeholder="{{'date.format.placeholder' | translate}}"
                          (focus)="birthDatePicker.open()" />
                        <mat-datepicker-toggle matSuffix [for]="birthDatePicker">
                          <mat-icon matDatepickerToggleIcon>
                            <img src="/assets/svg/calendar.svg" alt="sgma">
                        </mat-icon>
                        </mat-datepicker-toggle>
                        <mat-datepicker #birthDatePicker></mat-datepicker>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="row">
                  <div class="col">
                    <div class="form-control-wrapper">
                      <label class="form-control-label">{{ "personalInfo.address1" | translate }}</label>
                      <div class="form-control-container">
                        <textarea class="form-control-textarea" formControlName="address1" [rows]="3"></textarea>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="row">
                  <div class="col">
                    <div class="form-control-wrapper" [ngClass]="{'has-error': ProspectPhoneControl?.errors?.pattern}">
                      <label class="form-control-label">{{ "personalInfo.phone" | translate }}</label>
                      <div class="form-control-container">
                        <input class="form-control-input" type="text" formControlName="phone" />
                      </div>
                      <div class="error-container" *ngIf="ProspectPhoneControl?.errors?.pattern">
                        <span>{{ "customer.invalid.phone.message" | translate }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </cdk-step>
        <cdk-step formGroupName="employer" [stepControl]="employerFormGroup">
          <div class="step-header">
            <div class="step-title-container">
              <div class="step-visual">
                <img src="../../../../assets/img/steps/client-informations.svg" width="217" alt="Données Professionnelles">
              </div>
              <div class="step-title-wrapper">
                <h2 class="step-title">
                  1. {{"customer.loan.initiation.steps.customerdata.label" | translate }}
                </h2>
                <p class="step-description">
                  {{"customer.loan.initiation.steps.customerdata.description1" | translate }}
                </p>
              </div>
            </div>
          </div>
          <div class="step-form">
            <div class="stepper-content-body">
              <div class="step-form-container">
                <div class="row" *ngIf="customerHasNonSegement">
                  <div class="col">
                    <mat-form-field class="matselectsearch-dialog matselectsearch">
                      <mat-label class="form-control-label">{{ "customer.type.label" | translate }}<span>*</span></mat-label>
                      <div class="form-control-container">
                        <mat-select formControlName="cutomerType"  placeholder="choisissez un type client"
                         disableOptionCentering>                    
                            <mat-option value="CLIPRI">{{ "Particulier" | translate}}</mat-option>
                            <mat-option value="CLIPRO">{{ "Professionnel" | translate}}</mat-option>
                        </mat-select>
                      </div>
                      <div class="error-container" *ngIf="formGroup.get('employer.contractType')?.hasError('required')">
                      <span>{{"field.requierd.error.message" | translate}}</span>
                      </div>
                    </mat-form-field>
                  </div>
                </div>
                <div class="row" *ngIf="showContractType">
                  <div class="col">
                    <mat-form-field class="matselectsearch-dialog matselectsearch">
                      <mat-label class="form-control-label">{{ "employment.contract.label" | translate }}<span>*</span></mat-label>
                      <div class="form-control-container">
                        <mat-select formControlName="contractType"  placeholder="choisissez nature du contrat de travail" disableOptionCentering>                    
                            <mat-option value="CDI">{{ "CDI" | translate}}</mat-option>
                            <mat-option value="CDD">{{ "CDD" | translate}}</mat-option>
                        </mat-select>
                      </div>
                    </mat-form-field>
                  </div>
                </div>
                <div class="row" *ngIf="showContractType && contratType==='CDI'">
                  <div class="col-md-auto">
                    <label class="check-control">
                      <input type="checkbox" formControlName="isTitularized">
                      <div class="form-control-wrapper">
                        <span class="fake-check"></span>
                        <span class="fake-label">{{ "customer.employer.isTitularized" | translate }}</span>
                      </div>
                    </label>
                  </div>
                </div>
                <div class="row">
                  <div class="col">
                    <mat-form-field class="matselectsearch-dialog matselectsearch">
                      <mat-label class="form-control-label">{{ "customer.activity.sector" | translate }}</mat-label>
                      <div class="form-control-container">
                        <mat-select [compareWith]="compareObjects" formControlName="activitySector"
                          placeholder="choisissez un secteur d'activité" disableOptionCentering>
                          <mat-option>
                            <ngx-mat-select-search [formControl]="sectorActivityFilterControl"
                            [placeholderLabel]="'Recherche ici'"
                            [noEntriesFoundLabel]="'Aucun element correspondant trouvé'" ngDefaultControl>
                          </ngx-mat-select-search>
                          <span class="icon-search-select"></span>
                        </mat-option>
                          <mat-option *ngFor="let activity of  filteredActivitiesSectors$ | async" [value]="activity">
                            {{ activity?.designation | titlecase }}
                          </mat-option>
                        </mat-select>
                      </div>
                    </mat-form-field>
                  </div>
                </div>
                <div class="row" *ngIf="showSeparation">
                  <div class="col-md-auto" >
                    <label class="check-control">
                      <input type="checkbox" formControlName="separation">
                      <div class="form-control-wrapper">
                        <span class="fake-check"></span>
                        <span class="fake-label">{{ "Séparation vie privée / vie professionnelle" | translate }}</span>
                      </div>
                    </label>
                  </div>
                  </div>
                  <div class="row" *ngIf="!separation && showProfessionList">
                  <div class="col" >
                    <mat-form-field class="matselectsearch-dialog matselectsearch">
                      <mat-label class="form-control-label">{{ "Profession" | translate }}</mat-label>
                      <div class="form-control-container">
                        <mat-select [compareWith]="compareObjects" formControlName="profession" disableOptionCentering>
                          <mat-option>
                            <ngx-mat-select-search [formControl]="professionFilterControl"
                                                   [placeholderLabel]="'Recherche ici'"
                                                   [noEntriesFoundLabel]="'Aucun element correspondant trouvé'" ngDefaultControl>
                            </ngx-mat-select-search>
                            <span class="icon-search-select"></span>
                          </mat-option>
                          <mat-option *ngFor="let prof of filteredProfessions$ | async" [value]="prof">
                            {{ prof.designation }}
                          </mat-option>
                        </mat-select>
                      </div>
                    </mat-form-field>
                  </div>
                </div>
                <div class="row">
                  <div class="col">
                    <div class="form-control-wrapper">
                      <label class="form-control-label">{{ "customer.employer" | translate }}</label>
                      <div class="form-control-container">
                        <input class="form-control-input" type="text" formControlName="name" />
                      </div>
                    </div>
                  </div>
                </div>
                <div class="row">
                  <div class="col">
                    <div class="form-control-wrapper" [ngClass]="{'has-error': employerPhoneControl.errors?.pattern}">
                      <label class="form-control-label">{{ "customer.employer.phone" | translate }}</label>
                      <div class="form-control-container">
                        <input class="form-control-input" type="text" formControlName="phone" />
                      </div>
                      <div class="error-container" *ngIf="employerPhoneControl?.errors?.pattern">
                        <span>{{ "customer.invalid.phone.message" | translate }}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="row">
                  <div class="col">
                    <div class="form-control-wrapper">
                      <label class="form-control-label">{{ "customer.employer.address" | translate }}</label>
                      <div class="form-control-container">
                        <textarea class="form-control-textarea" type="text" formControlName="address"></textarea>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </cdk-step>
        <cdk-step formGroupName="financialData" [stepControl]="financialDataFormGroup">
          <div class="step-header">
            <div class="step-title-container">
              <div class="step-visual">
                <img src="../../../../assets/img/steps/client-informations.svg" width="217"
                  alt="Données Professionnelles">
              </div>
              <div class="step-title-wrapper">
                <h2 class="step-title">
                  2. {{"customer.loan.initiation.steps.customerdata.label" | translate }}
                </h2>
                <p class="step-description">
                  {{"customer.loan.initiation.steps.customerdata.description2" | translate }}
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
                      <label class="form-control-label">{{ "customer.income.label" | translate }}<span>*</span></label>
                      <div class="form-control-container">
                        <input class="form-control-input" type="text" appDecimalI18n formControlName="income" />
                      </div>
                        <div class="error-container" *ngIf="incomeControl.touched && incomeControl.hasError('required')">
                          {{ "field.requierd.error.message" | translate }}
                        </div>
                    </div>
                  </div>
                  <div class="col">
                    <div class="form-control-wrapper">
                      <label class="form-control-label">{{
                        "customer.spouseIncome.label" | translate
                        }}</label>
                      <div class="form-control-container">
                        <input class="form-control-input" type="text" appDecimalI18n formControlName="spouseIncome" />
                      </div>
                    </div>
                  </div>
                </div>
                <div class="row">
                  <div class="col">
                    <div class="form-control-wrapper">
                      <label class="form-control-label">
                        {{"rental-income" | translate}}
                      </label>
                      <div class="form-control-container">
                        <input class="form-control-input" type="text" appDecimalI18n formControlName="rentalIncome" />
                      </div>
                    </div>
                  </div>
                  <div class="col">
                    <div class="form-control-wrapper">
                      <label class="form-control-label">
                        {{"family-allowance" | translate}}
                      </label>
                      <div class="form-control-container">
                        <input class="form-control-input" type="text" appDecimalI18n
                          formControlName="familyAllowance" />
                      </div>
                    </div>
                  </div>
                </div>
                <div class="row">
                  <div class="col">
                    <div class="form-control-wrapper">
                      <label class="form-control-label">
                        {{"pension" | translate}}
                      </label>
                      <div class="form-control-container">
                        <input class="form-control-input" type="text" appDecimalI18n formControlName="pension" />
                      </div>
                    </div>
                  </div>
                  <div class="col">
                    <div class="form-control-wrapper">
                      <label class="form-control-label">
                        {{"dividends" | translate}}
                      </label>
                      <div class="form-control-container">
                        <input class="form-control-input" type="text" appDecimalI18n formControlName="dividends" />
                      </div>
                    </div>
                  </div>
                </div>
                <div class="row">
                  <div class="col">
                    <div class="form-control-wrapper">
                      <label class="form-control-label">{{
                        "customer.otherIncome.label" | translate
                        }}</label>
                      <div class="form-control-container">
                        <input class="form-control-input" type="text" appDecimalI18n formControlName="otherIncome" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </cdk-step>
      </app-stepper>
    </cdk-step>
    <cdk-step [stepControl]="loanDataFormGroup" formGroupName="loanData" [completed]="isStepCompleted(loanDataFormGroup,2)" [hasError]="isStepHasError(loanDataFormGroup,1)">
      <ng-template cdkStepLabel>
        <span>{{"customer.loan.initiation.steps.loandata.label" | translate}}</span>
      </ng-template>
      <app-customer-loan-data-form [loanDataFormGroup]="loanDataFormGroup"></app-customer-loan-data-form>
    </cdk-step>
    <cdk-step [stepControl]="propertyDataNotaryFormGroup" [completed]="isStepCompleted(propertyDataNotaryFormGroup,3)"
      [hasError]="isStepHasError(propertyDataNotaryFormGroup,2)">
      <ng-template cdkStepLabel>
        <span> {{ "customer.loan.initiation.steps.propertyDataNotary.label" | translate }} </span>
      </ng-template>
      <app-stepper [nextFunction]="update" [doneFunction]="nextStep" [firstPreviousFunction]="previousStep" [showNavigationList]="false" doneButtonLabel="Suivant">
        <cdk-step
          [stepControl]="propertyDataFormGroup"
          formGroupName="propertyData"
          [completed]="isStepCompleted(propertyDataFormGroup,2)"
          [hasError]="isStepHasError(propertyDataFormGroup,2)">
          <ng-template cdkStepLabel>
      <span>{{ "customer.loan.initiation.steps.propertyData.label" | translate }}</span>
          </ng-template>
          <app-loan-property-details
            class="property-body"
            [beneficiaryList]="dossierData?.beneficiaries || []"
            [propertyFormGroup]="propertyDataFormGroup"
            [loanDataFormGroup]="loanDataFormGroup"
            [propertyData]="dossierData.propertyData"
            [cities$]="cities$">
          </app-loan-property-details>
        </cdk-step>
        <cdk-step formGroupName="notary" [stepControl]="notaryFormGroup">
          <div class="step-header">
            <div class="step-title-container">
              <div class="step-visual">
                <img
                  src="../../../../assets/img/steps/client-informations.svg"
                  width="217"
                  alt=""
                />
              </div>
              <div class="step-title-wrapper">
                <h2 class="step-title">
                  2. {{ "customer.loan.initiation.steps.notary.label" | translate }}
                </h2>
                <p class="step-description">
                  {{ "customer.loan.initiation.steps.notary.description" | translate
                  }}
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
                      <label class="form-control-label">{{ "customer.notary.name" | translate }}</label>
                      <div class="form-control-container">
                        <input
                          class="form-control-input"
                          type="text"
                          appAlphanumericInput
                          formControlName="name"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div class="row">
                  <div class="col">
                    <div class="form-control-wrapper">
                      <label class="form-control-label">{{ "customer.notary.address" | translate }}</label>
                      <div class="form-control-container">
                  <textarea
                    class="form-control-textarea"
                    formControlName="address"
                    rows="3"></textarea>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="row">
                  <div class="col">
                    <div
                      class="form-control-wrapper"
                      [ngClass]="{'has-error': notaryPhoneFormControl.errors?.pattern}">
                      <label class="form-control-label"
                      >{{ "customer.notary.phone" | translate }}</label
                      >
                      <div class="form-control-container">
                        <input class="form-control-input" formControlName="phone" />
                      </div>
                      <div
                        class="error-container"
                        *ngIf="notaryPhoneFormControl?.errors?.pattern">
                  <span
                  >{{ "customer.invalid.phone.message" | translate }}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="row">
                  <div class="col">
                    <div
                      class="form-control-wrapper"
                      [ngClass]="{'has-error' : notaryMailFormControl.errors?.email}">
                      <label class="form-control-label">{{ "customer.notary.mail" | translate }}</label>
                      <div class="form-control-container">
                        <input
                          class="form-control-input"
                          type="text"
                          formControlName="email"
                        />
                      </div>
                      <div
                        class="error-container"
                        *ngIf="notaryMailFormControl?.errors?.email">
                        <span>{{ "customer.notary.valid.email" | translate }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </cdk-step>
      </app-stepper>
    </cdk-step>
    <cdk-step [stepControl]="beneficiariesFormArray" [completed]="isStepCompleted(beneficiariesFormArray,4)"
      [hasError]="isStepHasError(beneficiariesFormArray,3)">
      <ng-template cdkStepLabel>
        <span>
          {{ "customer.loan.initiation.steps.beneficiary.label" | translate }}
        </span>
      </ng-template>
      <app-beneficiaries-data-table 
      [representativeList]="dossierData?.representatives || []"
      [beneficiaryList]="dossierData?.beneficiaries || []"
      [guarantorsList]="dossierData?.guarantors || []"
      [propertyData]="dossierData?.propertyData || {}"
      [beneficiariesFormArray]="beneficiariesFormArray" 
      [guarantorsFormArray]="guarantorsFormArray"
      ></app-beneficiaries-data-table>
    </cdk-step>
      <cdk-step [completed]="isStepCompleted(representativesFormArray, 5)"
                [hasError]="isStepHasError(representativesFormArray, 5)">
          <ng-template cdkStepLabel>
        <span>
          {{"customer.loan.initiation.steps.representative.label" | translate}}
        </span>
          </ng-template>
          <app-representatives-data-table
                  [representativesList]="dossierData?.representatives || []"
                  [beneficiariesList]="dossierData?.beneficiaries || []"
                  [guarantorsList]="dossierData?.guarantors || []"
                  [representativesFormArray]="representativesFormArray">
          </app-representatives-data-table>
      </cdk-step>
    <cdk-step [stepControl]="insuranceDataFormGroup" [completed]="isStepCompleted(insuranceDataFormGroup,5)"
      [hasError]="isStepHasError(insuranceDataFormGroup,5)">
      <ng-template cdkStepLabel>
        <span>{{ 'customer.loan.initiation.steps.insurancedata.label' | translate}}</span>
      </ng-template>
      <app-customer-assurance-data-form [insuranceDataFormGroup]="insuranceDataFormGroup">
      </app-customer-assurance-data-form>
    </cdk-step>
    <cdk-step [stepControl]="warrantiesFormArray" [completed]="isStepCompleted(warrantiesFormArray,6)"
      [hasError]="isStepHasError(warrantiesFormArray,6)">
      <ng-template cdkStepLabel>
        <span>
          <span>{{ "stepper.warranties" | translate }}</span>
        </span>
      </ng-template>
      <app-dossier-warranties-form [globalForm]="formGroup" [warrantiesFormArray]="warrantiesFormArray"
        (validation)="statmentValidation()"></app-dossier-warranties-form>
    </cdk-step>
  </app-stepper>
</form>
