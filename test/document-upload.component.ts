import { Component, OnInit } from '@angular/core';
import { trigger, state, style, animate, transition } from '@angular/animations';

export type StatutIA = 'conforme' | 'a-verifier' | 'non-conforme' | 'en-traitement' | 'en-attente';

export interface ChampOCR {
  champ: string;
  valeurOCR: string;
  ficheClient: string;
  statut: 'ok' | 'erreur' | 'avertissement';
  confiance: number;
}

export interface Document {
  id: string;
  nom: string;
  type: string;
  statutIA: StatutIA;
  qualiteOCR?: number;
  action?: 'ok' | 'remplacer' | 'analyse';
  champsOCR?: ChampOCR[];
  expanded?: boolean;
  fichier?: File;
}

export interface DocumentRequis {
  id: string;
  nom: string;
  description: string;
  obligatoire: boolean;
  fichier?: File;
  statut: 'uploade' | 'erreur' | 'avertissement' | 'vide';
}

export interface StatutTempsReel {
  type: string;
  label: string;
  description: string;
  statut: 'ok' | 'erreur' | 'avertissement' | 'en-cours';
}

@Component({
  selector: 'app-document-upload',
  templateUrl: './document-upload.component.html',
  styleUrls: ['./document-upload.component.scss'],
  animations: [
    trigger('expandCollapse', [
      state('collapsed', style({ height: '0', overflow: 'hidden', opacity: 0 })),
      state('expanded', style({ height: '*', overflow: 'hidden', opacity: 1 })),
      transition('collapsed <=> expanded', animate('300ms ease-in-out')),
    ]),
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(8px)' }),
        animate('250ms ease-out', style({ opacity: 1, transform: 'translateY(0)' })),
      ]),
    ]),
  ],
})
export class DocumentUploadComponent implements OnInit {
  // Step 1: Vue "Documents Requis" avec vérification IA inline
  documents: Document[] = [
    {
      id: 'cin',
      nom: "Carte d'Identité Nationale",
      type: 'CIN',
      statutIA: 'conforme',
      qualiteOCR: 91,
      action: 'ok',
      champsOCR: [
        { champ: 'Nom', valeurOCR: 'DOGCNOIYIX', ficheClient: 'DOGCNOIYIX', statut: 'ok', confiance: 98 },
        { champ: 'Prénom', valeurOCR: 'DOGCNOIYIX', ficheClient: 'DOGCNOIYIX', statut: 'ok', confiance: 97 },
        { champ: "N°CIN", valeurOCR: '341092', ficheClient: '341092', statut: 'ok', confiance: 99 },
        { champ: 'Date naissance', valeurOCR: '15/03/1982', ficheClient: '15/03/1982', statut: 'ok', confiance: 96 },
        { champ: 'Date de validité', valeurOCR: '06/12/2030', ficheClient: '06/12/2030', statut: 'ok', confiance: 98 },
        { champ: 'MRZ vs données', valeurOCR: 'Cohérence recto/verso validée', ficheClient: '', statut: 'ok', confiance: 100 },
      ],
      expanded: true,
    },
    {
      id: 'attest-sal',
      nom: 'Attestation de salaire',
      type: 'Attest_sal',
      statutIA: 'conforme',
      qualiteOCR: 93,
      action: 'ok',
    },
    {
      id: 'bulletins',
      nom: 'Bulletins de Paie (x3)',
      type: 'Bulletin',
      statutIA: 'a-verifier',
      qualiteOCR: 79,
      action: 'remplacer',
    },
    {
      id: 'compromis',
      nom: 'Compromis de vente',
      type: 'Compromis',
      statutIA: 'non-conforme',
      qualiteOCR: 46,
      action: 'remplacer',
    },
    {
      id: 'releve',
      nom: 'Relevé de compte',
      type: 'Releve',
      statutIA: 'en-traitement',
      action: 'analyse',
    },
  ];

  // Step 2: Vue split — liste gauche + statut IA droite
  documentsRequis: DocumentRequis[] = [
    { id: 'attes-cnss', nom: 'Attes CNSS', description: 'Via si veri inermis in.', obligatoire: true, statut: 'uploade' },
    { id: 'avis-impo', nom: "Avis d'Imposi", description: 'Via si veri inermis in.', obligatoire: true, statut: 'erreur' },
    { id: 'bull-ach', nom: 'Bull ACH', description: 'Via si veri inermis in.', obligatoire: true, statut: 'avertissement' },
    { id: 'contrat-travail', nom: 'Contrat travail', description: 'Via si veri inermis in.', obligatoire: false, statut: 'vide' },
    { id: 'cin-caution', nom: 'CIN Caution', description: 'Via si veri inermis in.', obligatoire: false, statut: 'vide' },
    { id: 'contrat-bail', nom: 'Contrat de bail', description: 'Via si veri inermis in.', obligatoire: false, statut: 'vide' },
    { id: 'compromis-vente', nom: 'Compromis de vente', description: 'Via si veri inermis in.', obligatoire: false, statut: 'vide' },
    { id: 'lettre-notaire', nom: 'Lettre désignation Notaire', description: 'Via si veri inermis in.', obligatoire: false, statut: 'vide' },
  ];

  statutsTempsReel: StatutTempsReel[] = [
    { type: 'CIN', label: 'CIN', description: 'CIN conforme - MRZ OK.', statut: 'ok' },
    { type: 'Attestation salaire', label: 'Attestation salaire', description: 'Écart salaire : 12 500 = 13 000 MAD', statut: 'erreur' },
    { type: 'Bulletins', label: 'Bulletins', description: '3 bulletins - OK', statut: 'ok' },
    { type: 'Relevés', label: 'Relevés', description: '2/3 mois - M-3 manquant', statut: 'avertissement' },
    { type: 'Compromis', label: 'Compromis', description: 'Compromis conforme - TF + notaire extraits', statut: 'en-cours' },
    { type: 'LDN', label: 'LDN', description: 'LDN conforme - montant OK', statut: 'ok' },
  ];

  currentStep = 1;
  totalSteps = 3;
  uploadedCount = 3;
  totalRequired = 14;

  steps = [
    { label: 'Informations', icon: 'person' },
    { label: 'Documents', icon: 'description' },
    { label: 'Validation', icon: 'check_circle' },
  ];

  ngOnInit(): void {}

  toggleExpand(doc: Document): void {
    doc.expanded = !doc.expanded;
  }

  getStatutClass(statut: StatutIA): string {
    const map: Record<StatutIA, string> = {
      conforme: 'statut--conforme',
      'a-verifier': 'statut--avertissement',
      'non-conforme': 'statut--erreur',
      'en-traitement': 'statut--traitement',
      'en-attente': 'statut--attente',
    };
    return map[statut];
  }

  getStatutLabel(statut: StatutIA): string {
    const map: Record<StatutIA, string> = {
      conforme: 'Conforme',
      'a-verifier': 'À vérifier',
      'non-conforme': 'Non conforme',
      'en-traitement': 'En traitement',
      'en-attente': 'En attente',
    };
    return map[statut];
  }

  getStatutIcon(statut: StatutIA): string {
    const map: Record<StatutIA, string> = {
      conforme: 'check_circle',
      'a-verifier': 'warning',
      'non-conforme': 'cancel',
      'en-traitement': 'hourglass_empty',
      'en-attente': 'radio_button_unchecked',
    };
    return map[statut];
  }

  getDocStatutIcon(statut: DocumentRequis['statut']): string {
    const map = {
      uploade: 'check_circle',
      erreur: 'cancel',
      avertissement: 'warning',
      vide: 'insert_drive_file',
    };
    return map[statut];
  }

  getStatutTRIcon(statut: StatutTempsReel['statut']): string {
    const map = {
      ok: 'check_circle',
      erreur: 'cancel',
      avertissement: 'warning',
      'en-cours': 'radio_button_unchecked',
    };
    return map[statut];
  }

  onFileSelected(event: Event, docId: string): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      const doc = this.documentsRequis.find(d => d.id === docId);
      if (doc) {
        doc.fichier = input.files[0];
        doc.statut = 'uploade';
      }
    }
  }

  retournerDossier(): void {
    if (this.currentStep > 1) this.currentStep--;
  }

  suivant(): void {
    if (this.currentStep < this.totalSteps) this.currentStep++;
  }

  valider(): void {
    console.log('Dossier validé !');
    // Emit event ou navigation
  }

  get uploadProgress(): number {
    return Math.round((this.uploadedCount / this.totalRequired) * 100);
  }
}
