import { Component, OnInit, Inject, Injector, ChangeDetectionStrategy } from "@angular/core";
import { FormGroup, Validators, FormControl } from "@angular/forms";
import { MatDialogRef, MAT_DIALOG_DATA } from "@angular/material/dialog";
import { CodeLabel, PropertyItem, RefCity } from "@core/models";
import { Guarantor } from "@core/models/guarantor";
import { ReferentialService } from "@core/services";
import { SelectSearchService } from "@loan-dossier/services/select.service";
import { BaseComponent } from "@shared/components";
import { Observable } from "rxjs";
@Component({
  selector: 'app-beneficiary-form-dialog',
  templateUrl: 'beneficiary-form-dialog.component.html',
  styleUrls: ['./beneficiary-form-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BeneficiaryFormDialogComponent extends BaseComponent implements OnInit {
  beneficiaryFormGroup!: FormGroup;
  guarantors: (Guarantor[] | undefined);
  selectedGuarantors: (Guarantor[] | undefined);
  initialSelectedGuarantors: (Guarantor[] | undefined);
  beneficiaryTypeFormControl = new FormControl('1');
  cities$!: Observable<RefCity[]>;
  acquisitionProperties: PropertyItem[] = [];
  cityFilterControl=new FormControl();
  filteredCities$!: Observable< CodeLabel[]>;
  propertyFilterControl=new FormControl();
  filteredProperty$!: Observable< PropertyItem[]>;

  constructor(public refService: ReferentialService,private selectService: SelectSearchService,
    public dialogRef: MatDialogRef<BeneficiaryFormDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any, injector: Injector
  ) {
    super(injector);
    this.initBeneficiaryForm();
    this.cities$ = this.refService.getCities();
  }

  ngOnInit(): void {
    this.initAdultFormControl();
    this.initProperties();
    console.log({benef: this.data.selectedBeneficiary});
    
    if (this.data.selectedBeneficiary && this.data.selectedBeneficiary != null) {
      this.beneficiaryFormGroup.patchValue(this.data.selectedBeneficiary);
    }
    this.beneficiaryTypeFormControl.valueChanges.subscribe(v => this.onSelectBeneficiaryType(v));
    this.guarantors = this.data.guarantors.filter((g:Guarantor) => !this.data.idcards.includes(g.idCardNumber));
    this.initialSelectedGuarantors = this.data.selectedGuarantors;
    this.filteredCities$= this.selectService.filterOptions(this.cities$ || [],this.cityFilterControl,'designation');
    this.filteredProperty$ = this.selectService.filterOptions(this.acquisitionProperties || [], this.propertyFilterControl, 'landCertificateNumber');
  }

  private initProperties(): void {
    if (this.data.propertyData?.properties) {
      this.acquisitionProperties = this.data.propertyData.properties.filter( (p: PropertyItem) => p.forAcquisition ); 
    }
    if (!this.acquisitionProperties || this.acquisitionProperties.length === 0) {
      return; 
    }
    if (this.acquisitionProperties.length === 1) { 
      this.beneficiaryFormGroup.patchValue({ properties: [this.acquisitionProperties[0]] }); 
    } 
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  isAddButtonActif() {
    const beneficiaryType = this.beneficiaryTypeFormControl.value;
    if (beneficiaryType == '3') {
      return this.selectedGuarantors && this.selectedGuarantors.length > 0;
    } else {
      return !this.beneficiaryFormGroup.invalid;
    }
  }

  onSaveBeneficiary() {
    const beneficiaryType = this.beneficiaryTypeFormControl.value;
    if (beneficiaryType == '3') {
      this.dialogRef.close(this.selectedGuarantors);
    } else {
      const beneficiary = this.beneficiaryFormGroup.value;
      beneficiary.isBorrower = beneficiaryType == '2';
      beneficiary.isGuarantor = false;

      this.dialogRef.close(beneficiary);
    }
  }
   
  compareObjects(o1: any, o2: any): boolean {
    const code1 = typeof o1  === 'object' ? o1?.code : o1;
    const code2 = typeof o2  === 'object' ? o2?.code : o2;
    return  code1 === code2;
  }

  private initBeneficiaryForm() {
    this.beneficiaryFormGroup = this.formBuilder.group({
      lastname: [null, [Validators.required]],
      firstname: [null, [Validators.required]],
      address: [null, [Validators.required]],
      adult: [true],
      idCardNumber: [null, [Validators.required]],
      issuedAt: [null, [Validators.required]],
      representativeLastname: [null],
      representativeFirstname: [null],
      judgeAuthorizationDate: [null],
      birthDate: [null, [Validators.required]],
      codeBirthPlace: [null, [Validators.required]],
      properties: [[], Validators.required]
    });
  }

  onSelectBeneficiaryType(event: any) {
    this.beneficiaryFormGroup.reset();
    this.beneficiaryFormGroup.get('adult')?.setValue(true);
    switch (event) {
      case '1':
        this.beneficiaryFormGroup.enable();
        break;
      case '2':
        this.beneficiaryFormGroup.disable();
        let personalInfo = this.data.personalInfo;
        let beneficiary = {
          idCardNumber: personalInfo?.cardID,
          address: personalInfo?.address1 + "," + personalInfo?.address2 + "," + personalInfo?.address3,
          lastname: personalInfo?.lastName,
          firstname: personalInfo?.firstName,
          issuedAt: personalInfo?.cardIDEmissionDate,
          birthDate: personalInfo?.birthDate,
          codeBirthPlace: personalInfo?.birthCountry
        }
        this.beneficiaryFormGroup.patchValue(beneficiary);
        break;
      default: break
    }
  }

  isGuarantorSelected(idCardNumber: any): boolean {
    return this.initialSelectedGuarantors ? this.initialSelectedGuarantors.findIndex(sg => sg?.idCardNumber === idCardNumber) > -1 : false;
  }

  private initAdultFormControl() {
    this.getControlValueChanges(this.adultFormControl).subscribe((value) => {
      if (value === true) {
        this.representativeLastnameFormControl.removeValidators([Validators.required]);
        this.representativeLastnameFormControl.reset();
        this.representativeFirstnameFormControl.removeValidators([Validators.required]);
        this.representativeFirstnameFormControl.reset();
        this.judgeAuthorizationDateFormControl.removeValidators([Validators.required]);
        this.judgeAuthorizationDateFormControl.reset();
        this.idCardNumberFormControl.addValidators([Validators.required]);
        this.issuedAtFormControl.addValidators([Validators.required]);
      } else {
        this.representativeLastnameFormControl.addValidators([Validators.required]);
        this.representativeFirstnameFormControl.addValidators([Validators.required]);
        this.judgeAuthorizationDateFormControl.addValidators([Validators.required]);
        this.idCardNumberFormControl.removeValidators([Validators.required]);
        this.idCardNumberFormControl.reset();
        this.issuedAtFormControl.removeValidators([Validators.required]);
        this.issuedAtFormControl.reset();
      }
    });
  }


  get adultFormControl(): FormControl {
    return this.beneficiaryFormGroup.controls['adult'] as FormControl;
  }

  get representativeLastnameFormControl(): FormControl {
    return this.beneficiaryFormGroup.controls['representativeLastname'] as FormControl;
  }

  get representativeFirstnameFormControl(): FormControl {
    return this.beneficiaryFormGroup.controls['representativeFirstname'] as FormControl;
  }

  get judgeAuthorizationDateFormControl(): FormControl {
    return this.beneficiaryFormGroup.controls['judgeAuthorizationDate'] as FormControl;
  }

  get idCardNumberFormControl(): FormControl {
    return this.beneficiaryFormGroup.controls['idCardNumber'] as FormControl;
  }

  get issuedAtFormControl(): FormControl {
    return this.beneficiaryFormGroup.controls['issuedAt'] as FormControl;
  }
  get birthDateFormControl(): FormControl { return this.beneficiaryFormGroup.controls['birthDate'] as FormControl; }

  get codeBirthPlaceFormControl(): FormControl { return this.beneficiaryFormGroup.controls['codeBirthPlace'] as FormControl; }
}
