import { Component } from '@angular/core';

interface IAResult {
  key: string;
  ocrValue: string;
  clientValue: string;
  confidence: number;
  status: 'CONFORME' | 'NON_CONFORME';
}

interface Attachment {
  id: number;
  fileName: string;
  uploadDate: string;
  statusIA: 'CONFORME' | 'A_VERIFIER' | 'NON_CONFORME' | 'EN_COURS';
  ocrQuality: number;
  confidence: number;
  expanded?: boolean;
  results: IAResult[];
}

interface AttachmentType {
  id: number;
  label: string;
  code: string;
  globalStatus: 'CONFORME' | 'A_VERIFIER' | 'NON_CONFORME' | 'EN_COURS';
  attachments: Attachment[];
}

@Component({
  selector: 'app-attachment-ai-review',
  templateUrl: './attachment-ai-review.component.html',
  styleUrls: ['./attachment-ai-review.component.scss']
})
export class AttachmentAiReviewComponent {

  selectedTypeIndex = 0;

  attachmentTypes: AttachmentType[] = [
    {
      id: 1,
      label: 'Carte d’identité Nationale',
      code: 'CIN',
      globalStatus: 'CONFORME',
      attachments: [
        {
          id: 1,
          fileName: 'cin_recto_verso.pdf',
          uploadDate: '13/05/2026',
          statusIA: 'CONFORME',
          ocrQuality: 91,
          confidence: 98,
          expanded: true,
          results: [
            {
              key: 'Nom',
              ocrValue: 'DOGCNOIYIX',
              clientValue: 'DOGCNOIYIX',
              confidence: 98,
              status: 'CONFORME'
            },
            {
              key: 'Prénom',
              ocrValue: 'DOGCNOIYIX',
              clientValue: 'DOGCNOIYIX',
              confidence: 97,
              status: 'CONFORME'
            },
            {
              key: 'N°CIN',
              ocrValue: 'J341092',
              clientValue: 'J341092',
              confidence: 99,
              status: 'CONFORME'
            },
            {
              key: 'Date naissance',
              ocrValue: '15/03/1982',
              clientValue: '15/03/1982',
              confidence: 96,
              status: 'CONFORME'
            }
          ]
        }
      ]
    },
    {
      id: 2,
      label: 'Bulletins de Paie',
      code: 'BULLETIN',
      globalStatus: 'A_VERIFIER',
      attachments: [
        {
          id: 2,
          fileName: 'bulletin_mai_2026.pdf',
          uploadDate: '11/05/2026',
          statusIA: 'A_VERIFIER',
          ocrQuality: 82,
          confidence: 96,
          expanded: false,
          results: [
            {
              key: 'Salaire brut',
              ocrValue: '12 500 MAD',
              clientValue: '12 500 MAD',
              confidence: 98,
              status: 'CONFORME'
            },
            {
              key: 'Salaire net',
              ocrValue: '10 100 MAD',
              clientValue: '10 300 MAD',
              confidence: 61,
              status: 'NON_CONFORME'
            }
          ]
        },
        {
          id: 3,
          fileName: 'bulletin_juin_2026.pdf',
          uploadDate: '10/05/2026',
          statusIA: 'NON_CONFORME',
          ocrQuality: 58,
          confidence: 71,
          expanded: false,
          results: [
            {
              key: 'Salaire brut',
              ocrValue: '9 000 MAD',
              clientValue: '12 000 MAD',
              confidence: 45,
              status: 'NON_CONFORME'
            },
            {
              key: 'Employeur',
              ocrValue: 'DEV CORP',
              clientValue: 'DEV CORP',
              confidence: 97,
              status: 'CONFORME'
            }
          ]
        }
      ]
    },
    {
      id: 3,
      label: 'Relevé de compte',
      code: 'RELEVE',
      globalStatus: 'EN_COURS',
      attachments: [
        {
          id: 4,
          fileName: 'releve_bancaire.pdf',
          uploadDate: '09/05/2026',
          statusIA: 'EN_COURS',
          ocrQuality: 0,
          confidence: 0,
          expanded: false,
          results: []
        }
      ]
    }
  ];

  get selectedType(): AttachmentType {
    return this.attachmentTypes[this.selectedTypeIndex];
  }

  selectType(index: number): void {
    this.selectedTypeIndex = index;
  }

  toggleAttachment(attachment: Attachment): void {
    attachment.expanded = !attachment.expanded;
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'CONFORME':
        return 'Conforme';
      case 'A_VERIFIER':
        return 'À vérifier';
      case 'NON_CONFORME':
        return 'Non conforme';
      default:
        return 'En cours';
    }
  }
}
