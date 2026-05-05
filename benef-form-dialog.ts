import { Injectable } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { PropertyItem } from '@core/models';
import { Rang } from '@core/models/rang';
import { BeneficiaryModel } from './beneficiary-form-dialog.component';
import { rangUniqueValidator } from './rang-unique.validator';

@Injectable({ providedIn: 'root' })
export class BeneficiaryFormBuilder {

  constructor(private fb: FormBuilder) {}

  // ── Bénéficiaire ────────────────────────────────────────────────────────────

  buildBenefGroup(data?: Partial<BeneficiaryModel>): FormGroup {
    return this.fb.group({
      lastname:                [data?.lastname                ?? null, Validators.required],
      firstname:               [data?.firstname               ?? null, Validators.required],
      address:                 [data?.address                 ?? null, Validators.required],
      adult:                   [data?.adult                   ?? true],
      idCardNumber:            [data?.idCardNumber            ?? null, Validators.required],
      issuedAt:                [data?.issuedAt                ?? null, Validators.required],
      birthDate:               [data?.birthDate               ?? null, Validators.required],
      codeBirthPlace:          [data?.codeBirthPlace          ?? null, Validators.required],
      representativeLastname:  [data?.representativeLastname  ?? null],
      representativeFirstname: [data?.representativeFirstname ?? null],
      judgeAuthorizationDate:  [data?.judgeAuthorizationDate  ?? null],
      propertiesArray:         this.buildPropertiesArray(data?.properties ?? [], data?.rangs ?? [])
    });
  }

  // ── Properties ──────────────────────────────────────────────────────────────

  buildPropertiesArray(properties: PropertyItem[], rangs: Rang[]): FormArray {
    const groups = properties.map(p => this.buildPropertyGroup(p, rangs));
    return this.fb.array(groups, rangUniqueValidator());
  }

  buildPropertyGroup(property: PropertyItem, existingRangs: Rang[] = []): FormGroup {
    const propRangs = existingRangs.filter(
      r => r.propertyId === property.id || r.propertyUuid === property.uuid
    );
    return this.fb.group({
      propertyId:   [property.id   ?? null],
      propertyUuid: [property.uuid ?? null],
      rangsArray:   this.buildRangsArray(propRangs)
    });
  }

  // ── Rangs ───────────────────────────────────────────────────────────────────

  buildRangsArray(rangs: Rang[] = []): FormArray {
    return this.fb.array(rangs.map(r => this.buildRangGroup(r)));
  }

  buildRangGroup(data?: Partial<Rang>): FormGroup {
    return this.fb.group({
      id:             [data?.id             ?? null],
      rang:           [data?.rang           ?? null, Validators.required],
      warrantyAmount: [data?.warrantyAmount ?? null, Validators.required]
    });
  }
}




import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Validator sur propertiesArray —
 * vérifie que la valeur de 'rang' est unique parmi toutes les properties du bénéficiaire
 */
export function rangUniqueValidator(): ValidatorFn {
  return (propertiesArray: AbstractControl): ValidationErrors | null => {
    const allRangs: number[] = [];

    propertiesArray.value?.forEach((prop: any) => {
      prop.rangs?.forEach((r: any) => {
        if (r.rang != null) allRangs.push(r.rang);
      });
    });

    const hasDuplicate = allRangs.length !== new Set(allRangs).size;
    return hasDuplicate ? { rangDuplicate: true } : null;
  };
}


import {
  ChangeDetectionStrategy,
  Component,
  Inject,
  Injector,
  OnInit
} from '@angular/core';
import { FormArray, FormControl, FormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { CodeLabel, PropertyItem, RefCity } from '@core/models';
import { Guarantor } from '@core/models/guarantor';
import { Rang } from '@core/models/rang';
import { ReferentialService } from '@core/services';
import { SelectSearchService } from '@loan-dossier/services/select.service';
import { BaseComponent } from '@shared/components';
import { Observable } from 'rxjs';
import { BeneficiaryFormBuilder } from './beneficiary-form.builder';

// ─── Enums & Interfaces ───────────────────────────────────────────────────────

export enum BeneficiaryType {
  Free      = '1',
  Borrower  = '2',
  Guarantor = '3'
}

export interface PersonalInfo {
  cardID: string; cardIDEmissionDate: string;
  address1: string; address2: string; address3: string;
  lastName: string; firstName: string;
  birthDate: string; birthCountry: string;
}

export interface BeneficiaryModel {
  id?:                      number;
  lastname:                 string;
  firstname:                string;
  address:                  string;
  adult:                    boolean;
  idCardNumber:             string;
  issuedAt:                 string;
  birthDate:                string;
  codeBirthPlace:           string;
  representativeLastname?:  string;
  representativeFirstname?: string;
  judgeAuthorizationDate?:  string;
  properties:               PropertyItem[];
  rangs:                    Rang[];
  isBorrower:               boolean;
  isGuarantor:              boolean;
}

export interface DialogData {
  selectedBeneficiary?: BeneficiaryModel;
  guarantors:           Guarantor[];
  idcards:              string[];
  selectedGuarantors:   Guarantor[];
  propertyData?:        { properties: PropertyItem[] };
  personalInfo?:        PersonalInfo;
}

// ─── Component ────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-beneficiary-form-dialog',
  templateUrl: 'beneficiary-form-dialog.component.html',
  styleUrls: ['./beneficiary-form-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BeneficiaryFormDialogComponent extends BaseComponent implements OnInit {

  readonly BeneficiaryType = BeneficiaryType;

  beneficiaryTypeControl = new FormControl<BeneficiaryType>(BeneficiaryType.Free);
  beneficiariesArray     = this.formBuilder.array<FormGroup>([]);

  availableProperties:  PropertyItem[] = [];
  availableGuarantors:  Guarantor[]    = [];
  selectedGuarantors:   Guarantor[]    = [];

  cityFilterControl     = new FormControl('');
  propertyFilterControl = new FormControl('');
  filteredCities$!:     Observable<CodeLabel[]>;
  filteredProperties$!: Observable<PropertyItem[]>;

  private readonly cities$: Observable<RefCity[]>;
  private initialSelectedGuarantors: Guarantor[] = [];

  constructor(
    public  refService:    ReferentialService,
    private selectService: SelectSearchService,
    private benefBuilder:  BeneficiaryFormBuilder,
    public  dialogRef:     MatDialogRef<BeneficiaryFormDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData,
    injector: Injector
  ) {
    super(injector);
    this.cities$ = this.refService.getCities();
  }

  ngOnInit(): void {
    this.initAvailableData();
    this.initFilteredSearches();
    this.pushBenefGroup();
    this.initAdultToggleListener(0);
    this.loadData();

    this.beneficiaryTypeControl.valueChanges
      .subscribe(type => { if (type) this.onTypeChange(type); });
  }

  // ── Load / Save ─────────────────────────────────────────────────────────────

  loadData(): void {
    const benef = this.data.selectedBeneficiary;
    if (!benef) return;

    // Remplace le group avec les données + properties + rangs restaurés
    this.beneficiariesArray.setControl(
      0,
      this.benefBuilder.buildBenefGroup(benef)
    );
    this.initAdultToggleListener(0);
  }

  saveBeneficiary(): void {
    const type = this.beneficiaryTypeControl.value;

    if (type === BeneficiaryType.Guarantor) {
      this.dialogRef.close(
        this.benefGroups.map((g, i) => this.extractResult(g, true, false))
      );
    } else {
      this.dialogRef.close(
        this.extractResult(this.getBenefGroup(0), false, type === BeneficiaryType.Borrower)
      );
    }
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  // ── Type tabs ────────────────────────────────────────────────────────────────

  private onTypeChange(type: BeneficiaryType): void {
    this.beneficiariesArray.clear();
    this.pushBenefGroup();
    this.initAdultToggleListener(0);

    switch (type) {
      case BeneficiaryType.Free:
        this.getBenefGroup(0).enable();
        break;

      case BeneficiaryType.Borrower:
        this.patchPersonalInfo();
        this.getBenefGroup(0).disable();
        break;

      case BeneficiaryType.Guarantor:
        this.beneficiariesArray.clear();
        this.selectedGuarantors = [];
        break;
    }
    this.changeDetectorRef.markForCheck();
  }

  private patchPersonalInfo(): void {
    const p = this.data.personalInfo;
    if (!p) return;
    this.getBenefGroup(0).patchValue({
      idCardNumber:   p.cardID,
      address:        [p.address1, p.address2, p.address3].filter(Boolean).join(', '),
      lastname:       p.lastName,   firstname:      p.firstName,
      issuedAt:       p.cardIDEmissionDate,
      birthDate:      p.birthDate,  codeBirthPlace: p.birthCountry
    });
  }

  // ── Guarantors ──────────────────────────────────────────────────────────────

  onGuarantorsChange(): void {
    this.beneficiariesArray.clear();
    for (const g of this.selectedGuarantors) {
      this.pushBenefGroup({ lastname: g.lastName, firstname: g.firstName, idCardNumber: g.idCardNumber });
    }
    this.changeDetectorRef.markForCheck();
  }

  isGuarantorPreSelected(idCardNumber: string): boolean {
    return this.initialSelectedGuarantors.some(g => g.idCardNumber === idCardNumber);
  }

  // ── Properties & Rangs ───────────────────────────────────────────────────────

  onPropertiesSelected(benefIndex: number, selected: PropertyItem[]): void {
    const propertiesArray = this.getPropertiesArray(benefIndex);
    const existingKeys    = new Set(
      (propertiesArray.value as any[]).map(p => p.propertyId ?? p.propertyUuid)
    );

    // Ajouter les nouvelles properties
    selected
      .filter(p => !existingKeys.has(p.id ?? p.uuid))
      .forEach(p => propertiesArray.push(this.benefBuilder.buildPropertyGroup(p)));

    // Supprimer les properties désélectionnées
    const selectedKeys = new Set(selected.map(p => p.id ?? p.uuid));
    for (let i = propertiesArray.length - 1; i >= 0; i--) {
      const val = propertiesArray.at(i).value;
      if (!selectedKeys.has(val.propertyId ?? val.propertyUuid)) {
        propertiesArray.removeAt(i);
      }
    }
    this.changeDetectorRef.markForCheck();
  }

  addRang(benefIndex: number, propIndex: number): void {
    this.getRangsArray(benefIndex, propIndex)
      .push(this.benefBuilder.buildRangGroup());
    this.changeDetectorRef.markForCheck();
  }

  removeRang(benefIndex: number, propIndex: number, rangIndex: number): void {
    this.getRangsArray(benefIndex, propIndex).removeAt(rangIndex);
    this.changeDetectorRef.markForCheck();
  }

  // ── Form accessors ────────────────────────────────────────────────────────────

  get benefGroups(): FormGroup[] {
    return this.beneficiariesArray.controls as FormGroup[];
  }

  getBenefGroup(index: number): FormGroup {
    return this.beneficiariesArray.at(index) as FormGroup;
  }

  getFormControl(index: number, name: string): FormControl {
    return this.getBenefGroup(index).get(name) as FormControl;
  }

  getPropertiesArray(benefIndex: number): FormArray {
    return this.getBenefGroup(benefIndex).get('propertiesArray') as FormArray;
  }

  getPropertyGroups(benefIndex: number): FormGroup[] {
    return this.getPropertiesArray(benefIndex).controls as FormGroup[];
  }

  getRangsArray(benefIndex: number, propIndex: number): FormArray {
    return this.getPropertiesArray(benefIndex).at(propIndex).get('rangsArray') as FormArray;
  }

  getRangGroups(benefIndex: number, propIndex: number): FormGroup[] {
    return this.getRangsArray(benefIndex, propIndex).controls as FormGroup[];
  }

  hasRangDuplicate(benefIndex: number): boolean {
    return this.getPropertiesArray(benefIndex).hasError('rangDuplicate');
  }

  isSaveDisabled(): boolean {
    const type = this.beneficiaryTypeControl.value;
    if (type === BeneficiaryType.Guarantor) {
      return this.selectedGuarantors.length === 0
          || this.benefGroups.some(g => g.invalid);
    }
    return this.getBenefGroup(0).invalid;
  }

  compareByCode(o1: any, o2: any): boolean {
    const val = (o: any) => typeof o === 'object' ? o?.code : o;
    return val(o1) === val(o2);
  }

  // ── Private ───────────────────────────────────────────────────────────────────

  private initAvailableData(): void {
    this.availableProperties       = this.data.propertyData?.properties ?? [];
    this.availableGuarantors       = this.data.guarantors
      .filter(g => !this.data.idcards.includes(g.idCardNumber));
    this.initialSelectedGuarantors = this.data.selectedGuarantors ?? [];
  }

  private initFilteredSearches(): void {
    this.filteredCities$     = this.selectService.filterOptions(
      this.cities$, this.cityFilterControl, 'designation'
    );
    this.filteredProperties$ = this.selectService.filterOptions(
      this.availableProperties, this.propertyFilterControl, 'landCertificateNumber'
    );
  }

  private pushBenefGroup(data?: Partial<BeneficiaryModel>): void {
    this.beneficiariesArray.push(this.benefBuilder.buildBenefGroup(data));
  }

  private initAdultToggleListener(index: number): void {
    const group     = this.getBenefGroup(index);
    const idCard    = group.get('idCardNumber')!;
    const issuedAt  = group.get('issuedAt')!;
    const repLast   = group.get('representativeLastname')!;
    const repFirst  = group.get('representativeFirstname')!;
    const judgeDate = group.get('judgeAuthorizationDate')!;

    this.getControlValueChanges(group.get('adult') as FormControl)
      .subscribe(isAdult => {
        if (isAdult) {
          [idCard, issuedAt].forEach(c => c.addValidators(Validators.required));
          [repLast, repFirst, judgeDate].forEach(c => { c.removeValidators(Validators.required); c.reset(); });
        } else {
          [repLast, repFirst, judgeDate].forEach(c => c.addValidators(Validators.required));
          [idCard, issuedAt].forEach(c => { c.removeValidators(Validators.required); c.reset(); });
        }
        group.updateValueAndValidity();
        this.changeDetectorRef.markForCheck();
      });
  }

  private extractResult(
    group: FormGroup, isGuarantor: boolean, isBorrower: boolean
  ): BeneficiaryModel {
    const raw = group.getRawValue();
    // Flatten properties + rangs vers le format BeneficiaryModel
    const properties: PropertyItem[] = [];
    const rangs: Rang[]              = [];

    (raw.propertiesArray ?? []).forEach((p: any) => {
      properties.push({ id: p.propertyId, uuid: p.propertyUuid } as PropertyItem);
      (p.rangsArray ?? []).forEach((r: any) => {
        rangs.push({
          id:             r.id,
          rang:           r.rang,
          warrantyAmount: r.warrantyAmount,
          propertyId:     p.propertyId,
          propertyUuid:   p.propertyUuid
        } as Rang);
      });
    });

    return { ...raw, properties, rangs, isGuarantor, isBorrower };
  }
}
