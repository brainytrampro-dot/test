import {
  ChangeDetectionStrategy,
  Component,
  Inject,
  Injector,
  OnInit
} from '@angular/core';
import { AbstractControl, FormArray, FormControl, FormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { CodeLabel, PropertyItem, RefCity } from '@core/models';
import { Guarantor } from '@core/models/guarantor';
import { RangDto } from '@core/models/rang-dto';
import { ReferentialService } from '@core/services';
import { SelectSearchService } from '@loan-dossier/services/select.service';
import { BaseComponent } from '@shared/components';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-beneficiary-form-dialog',
  templateUrl: 'beneficiary-form-dialog.component.html',
  styleUrls: ['./beneficiary-form-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BeneficiaryFormDialogComponent extends BaseComponent implements OnInit {

  // ─── Type selector ───────────────────────────────────────────────────────────
  beneficiaryTypeFormControl = new FormControl('1');

  /**
   * FormArray générique — contient 1 FormGroup pour tabs 1/2,
   * ou N FormGroups pour tab 3 (1 par guarantor sélectionné).
   *
   * Chaque FormGroup contient les champs identité + properties.
   * Les rangs sont gérés dans rangsMap (hors FormGroup — trop dynamique).
   */
  beneficiariesFormArray!: FormArray;

  /**
   * Map centrale des rangs :
   *   index (position dans FormArray) → propertyKey → RangDto[]
   */
  rangsMap: Map<number, Map<string, RangDto[]>> = new Map();

  // ─── Referentials ────────────────────────────────────────────────────────────
  cities$!: Observable<RefCity[]>;
  acquisitionProperties: PropertyItem[] = [];
  cityFilterControl = new FormControl();
  filteredCities$!: Observable<CodeLabel[]>;
  propertyFilterControl = new FormControl();
  filteredProperty$!: Observable<PropertyItem[]>;

  // ─── Guarantors ──────────────────────────────────────────────────────────────
  guarantors: Guarantor[] | undefined;
  selectedGuarantors: Guarantor[] = [];
  initialSelectedGuarantors: Guarantor[] | undefined;

  constructor(
    public refService: ReferentialService,
    private selectService: SelectSearchService,
    public dialogRef: MatDialogRef<BeneficiaryFormDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    injector: Injector
  ) {
    super(injector);
    this.beneficiariesFormArray = this.formBuilder.array([]);
    this.cities$ = this.refService.getCities();
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.initProperties();

    // Tabs 1/2 — initialise avec 1 FormGroup vide
    this.addBenefFormGroup();
    this.initAdultFormControl(0);

    if (this.data.selectedBeneficiary) {
      this.getBenefGroup(0).patchValue(this.data.selectedBeneficiary);
      this.restoreExistingRangs(0, this.data.selectedBeneficiary);
    }

    this.beneficiaryTypeFormControl.valueChanges
      .subscribe(v => this.onSelectBeneficiaryType(v));

    this.guarantors = this.data.guarantors
      .filter((g: Guarantor) => !this.data.idcards.includes(g.idCardNumber));

    this.initialSelectedGuarantors = this.data.selectedGuarantors;

    this.filteredCities$ = this.selectService.filterOptions(
      this.cities$ || [], this.cityFilterControl, 'designation'
    );
    this.filteredProperty$ = this.selectService.filterOptions(
      this.acquisitionProperties || [], this.propertyFilterControl, 'landCertificateNumber'
    );
  }

  // ─── FormArray helpers ───────────────────────────────────────────────────────

  get benefGroups(): FormGroup[] {
    return this.beneficiariesFormArray.controls as FormGroup[];
  }

  getBenefGroup(index: number): FormGroup {
    return this.beneficiariesFormArray.at(index) as FormGroup;
  }

  getSelectedProperties(index: number): PropertyItem[] {
    return this.getBenefGroup(index).get('properties')?.value || [];
  }

  /**
   * Crée un FormGroup avec les champs identité + properties
   */
  private buildBenefFormGroup(data?: Partial<any>): FormGroup {
    return this.formBuilder.group({
      lastname:                [data?.lastname   ?? null, [Validators.required]],
      firstname:               [data?.firstname  ?? null, [Validators.required]],
      address:                 [data?.address    ?? null, [Validators.required]],
      adult:                   [data?.adult      ?? true],
      idCardNumber:            [data?.idCardNumber   ?? null, [Validators.required]],
      issuedAt:                [data?.issuedAt       ?? null, [Validators.required]],
      representativeLastname:  [data?.representativeLastname  ?? null],
      representativeFirstname: [data?.representativeFirstname ?? null],
      judgeAuthorizationDate:  [data?.judgeAuthorizationDate  ?? null],
      birthDate:               [data?.birthDate      ?? null, [Validators.required]],
      codeBirthPlace:          [data?.codeBirthPlace ?? null, [Validators.required]],
      properties:              [data?.properties ?? [], Validators.required]
    });
  }

  private addBenefFormGroup(data?: Partial<any>): void {
    this.beneficiariesFormArray.push(this.buildBenefFormGroup(data));
  }

  // ─── Properties change ───────────────────────────────────────────────────────

  onPropertiesChange(index: number): void {
    const selectedKeys = new Set(
      this.getSelectedProperties(index).map(p => this.getPropertyKey(p))
    );
    const indexRangs = this.rangsMap.get(index);
    if (indexRangs) {
      indexRangs.forEach((_, key) => {
        if (!selectedKeys.has(key)) indexRangs.delete(key);
      });
    }
    this.changeDetectorRef.markForCheck();
  }

  // ─── Rangs ───────────────────────────────────────────────────────────────────

  getPropertyKey(property: PropertyItem): string {
    return property.id?.toString() ?? property.uuid ?? property.landCertificateNumber ?? '';
  }

  getRangs(index: number, property: PropertyItem): RangDto[] {
    const propKey = this.getPropertyKey(property);
    if (!this.rangsMap.has(index)) this.rangsMap.set(index, new Map());
    const indexRangs = this.rangsMap.get(index)!;
    if (!indexRangs.has(propKey)) indexRangs.set(propKey, []);
    return indexRangs.get(propKey)!;
  }

  addRang(index: number, property: PropertyItem): void {
    const rangs = this.getRangs(index, property);
    rangs.push({
      id: null,
      rang: null,
      warrantyAmount: null,
      propertyId: property.id ?? null,
      propertyUuid: property.uuid ?? null
    });
    this.changeDetectorRef.markForCheck();
  }

  removeRang(index: number, property: PropertyItem, rangIndex: number): void {
    const rangs = this.getRangs(index, property);
    rangs.splice(rangIndex, 1);
    this.changeDetectorRef.markForCheck();
  }

  // ─── Guarantors (tab 3) ──────────────────────────────────────────────────────

  /**
   * Appelé quand l'utilisateur change la sélection des guarantors.
   * Rebuild le FormArray avec 1 FormGroup par guarantor sélectionné.
   */
  onGuarantorsChange(): void {
    // Reset FormArray et rangsMap
    this.beneficiariesFormArray.clear();
    this.rangsMap.clear();

    // Crée 1 FormGroup par guarantor sélectionné
    for (const guarantor of this.selectedGuarantors) {
      this.addBenefFormGroup({
        lastname:  guarantor.lastName,
        firstname: guarantor.firstName,
        // idCardNumber du guarantor pré-rempli si disponible
        idCardNumber: guarantor.idCardNumber
      });
    }
    this.changeDetectorRef.markForCheck();
  }

  isGuarantorSelected(idCardNumber: string): boolean {
    return this.initialSelectedGuarantors
      ? this.initialSelectedGuarantors.some(sg => sg?.idCardNumber === idCardNumber)
      : false;
  }

  // ─── Save ────────────────────────────────────────────────────────────────────

  onSaveBeneficiary(): void {
    const beneficiaryType = this.beneficiaryTypeFormControl.value;

    if (beneficiaryType === '3') {
      // Retourne la liste des guarantors enrichis avec properties + rangs
      const result = this.benefGroups.map((group, index) => ({
        ...group.value,
        isGuarantor: true,
        isBorrower: false,
        rangs: this.buildFlatRangsList(index, group.value.properties || [])
      }));
      this.dialogRef.close(result);
    } else {
      const beneficiary = this.getBenefGroup(0).value;
      beneficiary.isBorrower = beneficiaryType === '2';
      beneficiary.isGuarantor = false;
      beneficiary.rangs = this.buildFlatRangsList(0, this.getSelectedProperties(0));
      this.dialogRef.close(beneficiary);
    }
  }

  isAddButtonActif(): boolean {
    const beneficiaryType = this.beneficiaryTypeFormControl.value;
    if (beneficiaryType === '3') {
      return this.selectedGuarantors.length > 0
        && this.benefGroups.every(g => !g.invalid);
    }
    return !this.getBenefGroup(0).invalid;
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  compareObjects(o1: any, o2: any): boolean {
    const code1 = typeof o1 === 'object' ? o1?.code : o1;
    const code2 = typeof o2 === 'object' ? o2?.code : o2;
    return code1 === code2;
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  private buildFlatRangsList(index: number, properties: PropertyItem[]): RangDto[] {
    const result: RangDto[] = [];
    const indexRangs = this.rangsMap.get(index);
    if (!indexRangs) return result;

    for (const property of properties) {
      const propKey = this.getPropertyKey(property);
      const rangs = indexRangs.get(propKey) || [];
      for (const r of rangs) {
        result.push({
          id: r.id ?? null,
          rang: r.rang,
          warrantyAmount: r.warrantyAmount,
          propertyId: property.id ?? null,
          propertyUuid: property.uuid ?? null
        });
      }
    }
    return result;
  }

  private restoreExistingRangs(index: number, benef: any): void {
    if (!benef.rangs || !benef.properties) return;
    for (const property of benef.properties) {
      const propKey = this.getPropertyKey(property);
      const rangsForProp = (benef.rangs as RangDto[]).filter(
        r => r.propertyId === property.id || r.propertyUuid === property.uuid
      );
      if (rangsForProp.length > 0) {
        if (!this.rangsMap.has(index)) this.rangsMap.set(index, new Map());
        this.rangsMap.get(index)!.set(propKey, [...rangsForProp]);
      }
    }
  }

  private initProperties(): void {
    if (this.data.propertyData?.properties) {
      this.acquisitionProperties = this.data.propertyData.properties
        .filter((p: PropertyItem) => p.forAcquisition);
    }
    if (this.acquisitionProperties.length === 1) {
      // Pré-sélection si 1 seul bien — appliqué après création du FormGroup
      setTimeout(() => {
        this.getBenefGroup(0)?.patchValue({ properties: [this.acquisitionProperties[0]] });
      });
    }
  }

  onSelectBeneficiaryType(event: any): void {
    // Reset FormArray — 1 FormGroup vide pour tabs 1/2
    this.beneficiariesFormArray.clear();
    this.rangsMap.clear();
    this.addBenefFormGroup();
    this.initAdultFormControl(0);

    switch (event) {
      case '1':
        this.getBenefGroup(0).enable();
        break;
      case '2':
        this.getBenefGroup(0).disable();
        const personalInfo = this.data.personalInfo;
        this.getBenefGroup(0).patchValue({
          idCardNumber: personalInfo?.cardID,
          address: [personalInfo?.address1, personalInfo?.address2, personalInfo?.address3].join(','),
          lastname:  personalInfo?.lastName,
          firstname: personalInfo?.firstName,
          issuedAt:  personalInfo?.cardIDEmissionDate,
          birthDate: personalInfo?.birthDate,
          codeBirthPlace: personalInfo?.birthCountry
        });
        break;
      case '3':
        // Tab 3 — FormArray sera rebuild par onGuarantorsChange()
        this.beneficiariesFormArray.clear();
        this.selectedGuarantors = [];
        break;
      default: break;
    }
    this.changeDetectorRef.markForCheck();
  }

  private initAdultFormControl(index: number): void {
    const group = this.getBenefGroup(index);
    const adultCtrl = group.get('adult') as FormControl;

    this.getControlValueChanges(adultCtrl).subscribe((value) => {
      const repLastname  = group.get('representativeLastname')  as FormControl;
      const repFirstname = group.get('representativeFirstname') as FormControl;
      const judgeDate    = group.get('judgeAuthorizationDate')  as FormControl;
      const idCard       = group.get('idCardNumber')            as FormControl;
      const issuedAt     = group.get('issuedAt')                as FormControl;

      if (value === true) {
        repLastname.removeValidators([Validators.required]);   repLastname.reset();
        repFirstname.removeValidators([Validators.required]);  repFirstname.reset();
        judgeDate.removeValidators([Validators.required]);     judgeDate.reset();
        idCard.addValidators([Validators.required]);
        issuedAt.addValidators([Validators.required]);
      } else {
        repLastname.addValidators([Validators.required]);
        repFirstname.addValidators([Validators.required]);
        judgeDate.addValidators([Validators.required]);
        idCard.removeValidators([Validators.required]);  idCard.reset();
        issuedAt.removeValidators([Validators.required]); issuedAt.reset();
      }
    });
  }

  // ─── Form control getters (index 0 — tabs 1/2) ───────────────────────────────
  // Pour tab 3, les getters sont appelés avec l'index dans le template

  getFormControl(index: number, name: string): FormControl {
    return this.getBenefGroup(index).get(name) as FormControl;
  }

  // Alias pour compatibilité template tabs 1/2
  get adultFormControl(): FormControl        { return this.getFormControl(0, 'adult'); }
  get idCardNumberFormControl(): FormControl  { return this.getFormControl(0, 'idCardNumber'); }
  get issuedAtFormControl(): FormControl      { return this.getFormControl(0, 'issuedAt'); }
  get birthDateFormControl(): FormControl     { return this.getFormControl(0, 'birthDate'); }
  get codeBirthPlaceFormControl(): FormControl { return this.getFormControl(0, 'codeBirthPlace'); }
  get representativeLastnameFormControl(): FormControl  { return this.getFormControl(0, 'representativeLastname'); }
  get representativeFirstnameFormControl(): FormControl { return this.getFormControl(0, 'representativeFirstname'); }
  get judgeAuthorizationDateFormControl(): FormControl  { return this.getFormControl(0, 'judgeAuthorizationDate'); }
}
