import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
} from '@angular/core';
import { BehaviorSubject, combineLatest, Observable, Subject } from 'rxjs';
import { map, takeUntil } from 'rxjs/operators';
import { DossierAttachmentType, DossierAttachment, DocumentStatus } from './document-analysis.model';
import { AttachmentService } from './attachment.service';

export interface AttachmentViewModel {
  docTypes: DossierAttachmentType[];
  selected: DossierAttachmentType | null;
  expandedAttachment: DossierAttachment | null;
  avgPercent: number;
  globalStatus: DocumentStatus;
  mismatchKeys: string[];
}

@Component({
  selector: 'app-document-analysis',
  templateUrl: './document-analysis.component.html',
  styleUrls: ['./document-analysis.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentAnalysisComponent implements OnInit, OnDestroy {

  private destroy$ = new Subject<void>();

  private selectedCodeType$ = new BehaviorSubject<string | null>(null);
  private expandedAttachmentIndex$ = new BehaviorSubject<number | null>(null);

  vm$!: Observable<AttachmentViewModel>;

  constructor(private attachmentService: AttachmentService) {}

  ngOnInit(): void {
    this.vm$ = combineLatest([
      this.attachmentService.dossierAttachmentTypes$,
      this.selectedCodeType$,
      this.expandedAttachmentIndex$,
    ]).pipe(
      map(([docTypes, selectedCode, expandedIndex]) => {
        // Auto-select first on load
        const code = selectedCode ?? (docTypes[0]?.codeType ?? null);
        const selected = docTypes.find(d => d.codeType === code) ?? null;

        const expandedAttachment =
          expandedIndex !== null
            ? selected?.attachments[expandedIndex] ?? null
            : null;

        const avgPercent = selected?.attachments.length
          ? Math.round(
              selected.attachments.reduce((sum, a) => sum + a.percent, 0) /
              selected.attachments.length
            )
          : 0;

        const globalStatus = this.resolveGlobalStatus(selected?.attachments ?? []);

        // Keys where value differs — ici on flag les keys dont la value est null/undefined/vide
        const mismatchKeys = expandedAttachment
          ? Object.entries(expandedAttachment.responseIA)
              .filter(([, v]) => v === null || v === undefined || v === '')
              .map(([k]) => k)
          : [];

        return { docTypes, selected, expandedAttachment, avgPercent, globalStatus, mismatchKeys };
      }),
      takeUntil(this.destroy$)
    );
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ===== UI ACTIONS =====

  selectDocType(codeType: string): void {
    this.selectedCodeType$.next(codeType);
    this.expandedAttachmentIndex$.next(null);
  }

  toggleAttachment(index: number): void {
    this.expandedAttachmentIndex$.update(curr => curr === index ? null : index);
  }

  isExpanded(index: number): boolean {
    return this.expandedAttachmentIndex$.getValue() === index;
  }

  onValidate(): void {
    const selected = this.selectedCodeType$.getValue();
    console.log('Validated doc type:', selected);
  }

  onBack(): void {
    console.log('Back to dossier');
  }

  // ===== HELPERS =====

  getStatusLabel(status: DocumentStatus): string {
    const labels: Record<DocumentStatus, string> = {
      'conforme': 'Conforme',
      'non-conforme': 'Non conforme',
      'a-verifier': 'À vérifier',
      'en-traitement': 'En traitement',
    };
    return labels[status] ?? status;
  }

  getOcrBarColor(percent: number): string {
    if (percent >= 80) return 'var(--color-success)';
    if (percent >= 60) return 'var(--color-warning)';
    return 'var(--color-danger)';
  }

  trackByCode(_: number, item: DossierAttachmentType): string {
    return item.codeType;
  }

  trackByIndex(index: number): number {
    return index;
  }

  toEntries(responseIA: Record<string, unknown>): { key: string; value: unknown }[] {
    return Object.entries(responseIA).map(([key, value]) => ({ key, value }));
  }

  private resolveGlobalStatus(attachments: DossierAttachment[]): DocumentStatus {
    const statuses = attachments.map(a => a.statusIa);
    if (statuses.includes('non-conforme')) return 'non-conforme';
    if (statuses.includes('a-verifier')) return 'a-verifier';
    if (statuses.includes('en-traitement')) return 'en-traitement';
    return 'conforme';
  }
}
