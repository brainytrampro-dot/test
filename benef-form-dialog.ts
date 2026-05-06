import {
  ChangeDetectionStrategy,
  Component,
  Inject,
  Injector,
  OnInit
} from '@angular/core';
import {
  FormArray,
  FormControl,
  FormGroup,
  Validators
} from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { CodeLabel, PropertyItem, RefCity } from '@core/models';
import { Guarantor } from '@core/models/guarantor';
import { Rang } from '@core/models/rang';
import { ReferentialService } from '@core/services';
import { SelectSearchService } from '@loan-dossier/services/select.service';
import { BaseComponent } from '@shared/components';
import { Observable } from 'rxjs';

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum BeneficiaryType {
  Free      = '1',
  Borrower  = '2',
  Guarantor = '3'
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface PersonalInfo {
  cardID:              string;
  cardIDEmissionDate:  string;
  address1:            string;
  address2:            string;
  address3:            string;
  lastName:            string;
  firstName:           string;
  birthDate:           string;
  birthCountry:        string;
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

  // ── Public state ────────────────────────────────────────────────────────────

  readonly BeneficiaryType = BeneficiaryType;

  beneficiaryTypeControl = new FormControl<BeneficiaryType>(BeneficiaryType.Free);
  beneficiariesArray     = this.formBuilder.array<FormGroup>([]);

  availableProperties:  PropertyItem[]  = [];
  availableGuarantors:  Guarantor[]     = [];
  selectedGuarantors:   Guarantor[]     = [];

  cityFilterControl     = new FormControl('');
  propertyFilterControl = new FormControl('');
  filteredCities$!:    Observable<CodeLabel[]>;
  filteredProperties$!: Observable<PropertyItem[]>;

  /**
   * rangsMap[benefIndex][propertyKey] = Rang[]
   * propertyKey = property.id ?? property.uuid
   */
  private rangsMap = new Map<number, Map<string, Rang[]>>();

  private cities$: Observable<RefCity[]>;
  private initialSelectedGuarantors: Guarantor[] = [];

  // ── Constructor ─────────────────────────────────────────────────────────────

  constructor(
    public  refService:  ReferentialService,
    private selectService: SelectSearchService,
    public  dialogRef: MatDialogRef<BeneficiaryFormDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData,
    injector: Injector
  ) {
    super(injector);
    this.cities$ = this.refService.getCities();
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.initAvailableData();
    this.initFilteredSearches();
    this.pushBenefGroup();
    this.initAdultToggleListener(0);
    this.loadData();

    this.beneficiaryTypeControl.valueChanges.subscribe(type => {
      if (type) this.onTypeChange(type);
    });
  }

  // ── Load / Save ─────────────────────────────────────────────────────────────

  /**
   * Si selectedBeneficiary existe → patch le form + restore les rangs
   */
  loadData(): void {
    const benef = this.data.selectedBeneficiary;
    if (!benef) return;

    this.getBenefGroup(0).patchValue(benef);
    this.restoreRangs(0, benef);
  }

  /**
   * Construit le(s) bénéficiaire(s) à retourner selon le type sélectionné
   */
  saveBeneficiary(): void {
    const type = this.beneficiaryTypeControl.value;

    if (type === BeneficiaryType.Guarantor) {
      const result = this.benefGroups.map((group, i) =>
        this.buildBeneficiaryResult(group, i, true, false)
      );
      this.dialogRef.close(result);
    } else {
      const result = this.buildBeneficiaryResult(
        this.getBenefGroup(0),
        0,
        false,
        type === BeneficiaryType.Borrower
      );
      this.dialogRef.close(result);
    }
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  // ── Type change ─────────────────────────────────────────────────────────────

  private onTypeChange(type: BeneficiaryType): void {
    this.beneficiariesArray.clear();
    this.rangsMap.clear();
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
      lastname:       p.lastName,
      firstname:      p.firstName,
      issuedAt:       p.cardIDEmissionDate,
      birthDate:      p.birthDate,
      codeBirthPlace: p.birthCountry
    });
  }

  // ── Guarantors ──────────────────────────────────────────────────────────────

  onGuarantorsChange(): void {
    this.beneficiariesArray.clear();
    this.rangsMap.clear();

    for (const g of this.selectedGuarantors) {
      this.pushBenefGroup({
        lastname:     g.lastName,
        firstname:    g.firstName,
        idCardNumber: g.idCardNumber
      });
    }
    this.changeDetectorRef.markForCheck();
  }

  isGuarantorPreSelected(idCardNumber: string): boolean {
    return this.initialSelectedGuarantors.some(g => g.idCardNumber === idCardNumber);
  }

  // ── Rangs ────────────────────────────────────────────────────────────────────

  getRangs(benefIndex: number, property: PropertyItem): Rang[] {
    const key = this.propertyKey(property);
    if (!this.rangsMap.has(benefIndex)) this.rangsMap.set(benefIndex, new Map());
    const map = this.rangsMap.get(benefIndex)!;
    if (!map.has(key)) map.set(key, []);
    return map.get(key)!;
  }

  addRang(benefIndex: number, property: PropertyItem): void {
    this.getRangs(benefIndex, property).push({
      propertyId:   property.id,
      propertyUuid: property.uuid
    } as Rang);
    this.changeDetectorRef.markForCheck();
  }

  removeRang(benefIndex: number, property: PropertyItem, rangIndex: number): void {
    this.getRangs(benefIndex, property).splice(rangIndex, 1);
    this.changeDetectorRef.markForCheck();
  }

  onPropertiesChange(benefIndex: number): void {
    const selectedKeys = new Set(
      this.getSelectedProperties(benefIndex).map(p => this.propertyKey(p))
    );
    this.rangsMap.get(benefIndex)?.forEach((_, key) => {
      if (!selectedKeys.has(key)) this.rangsMap.get(benefIndex)!.delete(key);
    });
    this.changeDetectorRef.markForCheck();
  }

  // ── Form helpers ─────────────────────────────────────────────────────────────

  get benefGroups(): FormGroup[] {
    return this.beneficiariesArray.controls as FormGroup[];
  }

  getBenefGroup(index: number): FormGroup {
    return this.beneficiariesArray.at(index) as FormGroup;
  }

  getFormControl(index: number, name: string): FormControl {
    return this.getBenefGroup(index).get(name) as FormControl;
  }

  getSelectedProperties(index: number): PropertyItem[] {
    return this.getBenefGroup(index).get('properties')?.value ?? [];
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
    const val = (o: any) => (typeof o === 'object' ? o?.code : o);
    return val(o1) === val(o2);
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private initAvailableData(): void {
    this.availableProperties      = this.data.propertyData?.properties ?? [];
    this.availableGuarantors      = this.data.guarantors.filter(
      g => !this.data.idcards.includes(g.idCardNumber)
    );
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
    this.beneficiariesArray.push(this.buildBenefGroup(data));
  }

  private buildBenefGroup(data?: Partial<BeneficiaryModel>): FormGroup {
    return this.formBuilder.group({
      lastname:                 [data?.lastname                ?? null, Validators.required],
      firstname:                [data?.firstname               ?? null, Validators.required],
      address:                  [data?.address                 ?? null, Validators.required],
      adult:                    [data?.adult                   ?? true],
      idCardNumber:             [data?.idCardNumber            ?? null, Validators.required],
      issuedAt:                 [data?.issuedAt                ?? null, Validators.required],
      birthDate:                [data?.birthDate               ?? null, Validators.required],
      codeBirthPlace:           [data?.codeBirthPlace          ?? null, Validators.required],
      representativeLastname:   [data?.representativeLastname  ?? null],
      representativeFirstname:  [data?.representativeFirstname ?? null],
      judgeAuthorizationDate:   [data?.judgeAuthorizationDate  ?? null],
      properties:               [data?.properties              ?? [],   Validators.required]
    });
  }

  /**
   * Écoute le toggle adult/minor et met à jour les validators dynamiquement
   */
  private initAdultToggleListener(index: number): void {
    const group = this.getBenefGroup(index);

    const idCard    = group.get('idCardNumber')!;
    const issuedAt  = group.get('issuedAt')!;
    const repLast   = group.get('representativeLastname')!;
    const repFirst  = group.get('representativeFirstname')!;
    const judgeDate = group.get('judgeAuthorizationDate')!;

    this.getControlValueChanges(group.get('adult') as FormControl).subscribe(isAdult => {
      if (isAdult) {
        idCard.addValidators(Validators.required);
        issuedAt.addValidators(Validators.required);
        [repLast, repFirst, judgeDate].forEach(c => { c.removeValidators(Validators.required); c.reset(); });
      } else {
        [repLast, repFirst, judgeDate].forEach(c => c.addValidators(Validators.required));
        [idCard, issuedAt].forEach(c => { c.removeValidators(Validators.required); c.reset(); });
      }
      group.updateValueAndValidity();
      this.changeDetectorRef.markForCheck();
    });
  }

  private restoreRangs(benefIndex: number, benef: BeneficiaryModel): void {
    if (!benef.rangs?.length || !benef.properties?.length) return;

    for (const property of benef.properties) {
      const key       = this.propertyKey(property);
      const propRangs = benef.rangs.filter(
        r => r.propertyId === property.id || r.propertyUuid === property.uuid
      );
      if (!propRangs.length) continue;

      if (!this.rangsMap.has(benefIndex)) this.rangsMap.set(benefIndex, new Map());
      this.rangsMap.get(benefIndex)!.set(key, [...propRangs]);
    }
  }

  private buildBeneficiaryResult(
    group:       FormGroup,
    index:       number,
    isGuarantor: boolean,
    isBorrower:  boolean
  ): BeneficiaryModel {
    const properties: PropertyItem[] = group.get('properties')?.value ?? [];
    return {
      ...group.getRawValue(),
      isGuarantor,
      isBorrower,
      rangs: this.buildFlatRangs(index, properties)
    };
  }

  private buildFlatRangs(benefIndex: number, properties: PropertyItem[]): Rang[] {
    const indexMap = this.rangsMap.get(benefIndex);
    if (!indexMap) return [];

    return properties.flatMap(property => {
      const rangs = indexMap.get(this.propertyKey(property)) ?? [];
      return rangs.map(r => ({
        id:           r.id,
        rang:         r.rang,
        warrantyAmount: r.warrantyAmount,
        propertyId:   property.id,
        propertyUuid: property.uuid
      } as Rang));
    });
  }

  private propertyKey(property: PropertyItem): string {
    return property.id?.toString() ?? property.uuid ?? '';
  }
}
