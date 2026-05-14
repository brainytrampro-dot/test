import { Component, OnInit, ChangeDetectionStrategy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { trigger, transition, style, animate, stagger, query, state } from '@angular/animations';

export type DocumentStatus = 'conforme' | 'non-conforme' | 'a-verifier' | 'en-traitement';
export type FieldStatus = 'match' | 'mismatch' | 'pending';

export interface ExtractedField {
  key: string;
  ocrValue: string;
  clientValue: string;
  status: FieldStatus;
  confidence: number;
}

export interface DocumentAttachment {
  id: string;
  name: string;
  filename: string;
  status: DocumentStatus;
  ocrQuality: number;
  confidence: number;
  extractedFields?: ExtractedField[];
  expanded?: boolean;
}

export interface DocumentType {
  id: string;
  label: string;
  shortLabel: string;
  count: number;
  status: DocumentStatus;
  attachments: DocumentAttachment[];
}

@Component({
  selector: 'app-document-analysis',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './document-analysis.component.html',
  styleUrls: ['./document-analysis.component.scss'],
  animations: [
    trigger('fadeSlideIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(12px)' }),
        animate('300ms cubic-bezier(0.4, 0, 0.2, 1)', style({ opacity: 1, transform: 'translateY(0)' }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ opacity: 0, transform: 'translateY(-8px)' }))
      ])
    ]),
    trigger('expandCollapse', [
      state('collapsed', style({ height: '0px', opacity: 0, overflow: 'hidden' })),
      state('expanded', style({ height: '*', opacity: 1 })),
      transition('collapsed <=> expanded', animate('280ms cubic-bezier(0.4, 0, 0.2, 1)'))
    ]),
    trigger('listStagger', [
      transition('* => *', [
        query(':enter', [
          style({ opacity: 0, transform: 'translateX(-10px)' }),
          stagger(60, animate('250ms ease-out', style({ opacity: 1, transform: 'translateX(0)' })))
        ], { optional: true })
      ])
    ]),
    trigger('pulse', [
      transition(':enter', [
        style({ transform: 'scale(0.92)', opacity: 0 }),
        animate('350ms cubic-bezier(0.34, 1.56, 0.64, 1)', style({ transform: 'scale(1)', opacity: 1 }))
      ])
    ])
  ]
})
export class DocumentAnalysisComponent implements OnInit {
  
  selectedDocTypeId = signal<string>('bulletins-paie');
  expandedAttachmentId = signal<string | null>('bulletin-juillet');

  readonly documentTypes = signal<DocumentType[]>([
    {
      id: 'cin',
      label: 'Carte d\'identité Nationale',
      shortLabel: 'CIN',
      count: 1,
      status: 'conforme',
      attachments: [
        {
          id: 'cin-001',
          name: 'CIN - Recto/Verso',
          filename: 'cin_recto_verso.pdf',
          status: 'conforme',
          ocrQuality: 94,
          confidence: 98,
          extractedFields: [
            { key: 'Nom', ocrValue: 'DOCGNOIYIX', clientValue: 'DOCGNOIYIX', status: 'match', confidence: 99 },
            { key: 'N°CIN', ocrValue: '341092', clientValue: '341092', status: 'match', confidence: 99 },
          ]
        }
      ]
    },
    {
      id: 'attest-sal',
      label: 'Attestation de salaire',
      shortLabel: 'Attest_sal',
      count: 1,
      status: 'conforme',
      attachments: [
        {
          id: 'attest-001',
          name: 'Attestation de salaire 2024',
          filename: 'attest_sal_2024.pdf',
          status: 'conforme',
          ocrQuality: 91,
          confidence: 95
        }
      ]
    },
    {
      id: 'bulletins-paie',
      label: 'Bulletins de Paie',
      shortLabel: 'Bulletin',
      count: 3,
      status: 'a-verifier',
      attachments: [
        {
          id: 'bulletin-mai',
          name: 'Bulletin de paie - Mai 2024',
          filename: 'bulletin_mai_2024.pdf',
          status: 'a-verifier',
          ocrQuality: 82,
          confidence: 96,
        },
        {
          id: 'bulletin-juin',
          name: 'Bulletin de paie - Juin 2024',
          filename: 'bulletin_juin_2024.pdf',
          status: 'a-verifier',
          ocrQuality: 78,
          confidence: 93,
        },
        {
          id: 'bulletin-juillet',
          name: 'Bulletin de paie - Juillet 2024',
          filename: 'bulletin_juillet_2024.pdf',
          status: 'non-conforme',
          ocrQuality: 58,
          confidence: 71,
          expanded: true,
          extractedFields: [
            { key: 'Nom', ocrValue: 'DOCGNOIYIX', clientValue: 'DOCGNOIYIX', status: 'match', confidence: 98 },
            { key: 'Prénom', ocrValue: 'DOCGNOIYIX', clientValue: 'DOCGNOIYIX', status: 'match', confidence: 97 },
            { key: 'N°CIN', ocrValue: '341092', clientValue: '341092', status: 'match', confidence: 99 },
            { key: 'Date naissance', ocrValue: '15/03/1982', clientValue: '15/03/1982', status: 'match', confidence: 95 },
            { key: 'Date de paie', ocrValue: '31/07/2024', clientValue: '31/07/2024', status: 'match', confidence: 100 },
            { key: 'Salaire brut', ocrValue: '12 500,00 MAD', clientValue: '12 800,00 MAD', status: 'mismatch', confidence: 60 },
            { key: 'Salaire net', ocrValue: '10 200,00 MAD', clientValue: '10 500,00 MAD', status: 'mismatch', confidence: 58 },
            { key: 'Matricule', ocrValue: 'EMP-4587', clientValue: 'EMP-4587', status: 'match', confidence: 97 },
          ]
        }
      ]
    },
    {
      id: 'compromis',
      label: 'Comptomis de vente',
      shortLabel: 'Comprovis',
      count: 1,
      status: 'non-conforme',
      attachments: []
    },
    {
      id: 'releve',
      label: 'Relevé de compte',
      shortLabel: 'Releve',
      count: 1,
      status: 'en-traitement',
      attachments: []
    }
  ]);

  selectedDocType = computed(() =>
    this.documentTypes().find(d => d.id === this.selectedDocTypeId())!
  );

  avgOcrQuality = computed(() => {
    const attachments = this.selectedDocType()?.attachments ?? [];
    if (!attachments.length) return 0;
    return Math.round(attachments.reduce((sum, a) => sum + a.ocrQuality, 0) / attachments.length);
  });

  globalStatus = computed(() => {
    const statuses = this.selectedDocType()?.attachments.map(a => a.status) ?? [];
    if (statuses.includes('non-conforme')) return 'non-conforme';
    if (statuses.includes('a-verifier')) return 'a-verifier';
    if (statuses.includes('en-traitement')) return 'en-traitement';
    return 'conforme';
  });

  expandedAttachment = computed(() => {
    const id = this.expandedAttachmentId();
    return this.selectedDocType()?.attachments.find(a => a.id === id) ?? null;
  });

  mismatchFields = computed(() =>
    this.expandedAttachment()?.extractedFields?.filter(f => f.status === 'mismatch') ?? []
  );

  ngOnInit(): void {}

  selectDocType(id: string): void {
    this.selectedDocTypeId.set(id);
    this.expandedAttachmentId.set(null);
  }

  toggleAttachment(attachmentId: string): void {
    this.expandedAttachmentId.update(curr => curr === attachmentId ? null : attachmentId);
  }

  isExpanded(id: string): boolean {
    return this.expandedAttachmentId() === id;
  }

  getStatusLabel(status: DocumentStatus): string {
    const labels: Record<DocumentStatus, string> = {
      'conforme': 'Conforme',
      'non-conforme': 'Non conforme',
      'a-verifier': 'À vérifier',
      'en-traitement': 'En traitement'
    };
    return labels[status];
  }

  getOcrBarColor(quality: number): string {
    if (quality >= 80) return 'var(--color-success)';
    if (quality >= 60) return 'var(--color-warning)';
    return 'var(--color-danger)';
  }

  trackById(_: number, item: { id: string }): string {
    return item.id;
  }

  trackByKey(_: number, item: { key: string }): string {
    return item.key;
  }

  onValidate(): void {
    console.log('Validated:', this.selectedDocType().id);
  }

  onBack(): void {
    console.log('Back to dossier');
  }
}
