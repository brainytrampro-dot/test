import {
  Component, OnInit, HostListener, Output, EventEmitter
} from '@angular/core';
import {
  trigger, state, style, animate, transition
} from '@angular/animations';

export type DocStatut = 'uploade' | 'erreur' | 'avertissement' | 'vide';
export type TRStatut  = 'ok' | 'erreur' | 'avertissement' | 'en-cours';

export interface DocFile {
  id:       string;
  nom:      string;
  desc:     string;
  statut:   DocStatut;
  fichier?: File;
  isDragOver?: boolean;
}

export interface DocGroup {
  id:        string;
  label:     string;        // ex. "Identité", "Revenus", "Bien immobilier"
  icon:      string;        // material icon name
  expanded:  boolean;
  docs:      DocFile[];
}

export interface StatutTR {
  label:       string;
  description: string;
  statut:      TRStatut;
}

@Component({
  selector: 'app-loan-doc-upload',
  templateUrl: './loan-doc-upload.component.html',
  styleUrls:  ['./loan-doc-upload.component.scss'],
  animations: [
    trigger('collapse', [
      state('open',   style({ height: '*',   opacity: 1, overflow: 'hidden' })),
      state('closed', style({ height: '0px', opacity: 0, overflow: 'hidden' })),
      transition('open <=> closed', animate('260ms cubic-bezier(0.4,0,0.2,1)')),
    ]),
  ],
})
export class LoanDocUploadComponent implements OnInit {

  @Output() stepBack      = new EventEmitter<void>();
  @Output() stepValidated = new EventEmitter<void>();

  // ── Groupes de documents (collapsible cards) ─────────────────────
  docGroups: DocGroup[] = [
    {
      id: 'identite', label: 'Identité', icon: 'badge', expanded: true,
      docs: [
        { id: 'attes-cnss', nom: 'Attes CNSS',    desc: 'Attestation CNSS en cours de validité', statut: 'uploade' },
        { id: 'avis-impo',  nom: "Avis d'Imposi", desc: "Avis d'imposition dernière année",       statut: 'erreur'  },
        { id: 'cin-caution',nom: 'CIN Caution',   desc: 'CIN de la caution',                      statut: 'vide'    },
      ],
    },
    {
      id: 'revenus', label: 'Revenus', icon: 'payments', expanded: true,
      docs: [
        { id: 'bull-ach',       nom: 'Bull ACH',          desc: "Bulletin d'achat signé",       statut: 'avertissement' },
        { id: 'contrat-travail',nom: 'Contrat travail',   desc: 'Contrat de travail en cours',  statut: 'vide'          },
      ],
    },
    {
      id: 'bien', label: 'Bien immobilier', icon: 'home_work', expanded: false,
      docs: [
        { id: 'contrat-bail',    nom: 'Contrat de bail',           desc: 'Contrat de bail notarié',               statut: 'vide' },
        { id: 'compromis-vente', nom: 'Compromis de vente',        desc: 'Compromis de vente signé',              statut: 'vide' },
        { id: 'lettre-notaire',  nom: 'Lettre désignation Notaire',desc: 'Lettre de désignation du notaire',      statut: 'vide' },
      ],
    },
  ];

  // ── Statuts temps réel ───────────────────────────────────────────
  statutsTR: StatutTR[] = [
    { label: 'CIN',                description: 'CIN conforme - MRZ OK.',                     statut: 'ok'           },
    { label: 'Attestation salaire',description: 'Écart salaire : 12 500 ≠ 13 000 MAD',        statut: 'erreur'       },
    { label: 'Bulletins',          description: '3 bulletins - OK',                            statut: 'ok'           },
    { label: 'Relevés',            description: '2/3 mois - M-3 manquant',                     statut: 'avertissement'},
    { label: 'Compromis',          description: 'Compromis conforme - TF + notaire extraits',  statut: 'en-cours'     },
    { label: 'LDN',                description: 'LDN conforme - montant OK',                   statut: 'ok'           },
  ];

  ngOnInit(): void {}

  // ── Computed ─────────────────────────────────────────────────────
  get allDocs(): DocFile[] {
    return this.docGroups.flatMap(g => g.docs);
  }
  get uploadedCount(): number { return this.allDocs.filter(d => d.statut === 'uploade').length; }
  get totalCount():   number { return this.allDocs.length; }
  get progressPct():  number { return Math.round((this.uploadedCount / this.totalCount) * 100); }

  // ── Toggle group ─────────────────────────────────────────────────
  toggleGroup(group: DocGroup): void {
    group.expanded = !group.expanded;
  }

  // ── Group statut summary ─────────────────────────────────────────
  getGroupStatut(group: DocGroup): 'ok' | 'erreur' | 'avertissement' | 'neutre' {
    const docs = group.docs;
    if (docs.some(d => d.statut === 'erreur'))        return 'erreur';
    if (docs.some(d => d.statut === 'avertissement')) return 'avertissement';
    if (docs.every(d => d.statut === 'uploade'))      return 'ok';
    return 'neutre';
  }

  getGroupUploadCount(group: DocGroup): number {
    return group.docs.filter(d => d.statut === 'uploade').length;
  }

  // ── File select (click) ──────────────────────────────────────────
  onFileClick(event: Event, doc: DocFile): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.attachFile(doc, input.files[0]);
    }
  }

  // ── Drag & Drop ──────────────────────────────────────────────────
  onDragOver(event: DragEvent, doc: DocFile): void {
    event.preventDefault();
    event.stopPropagation();
    doc.isDragOver = true;
  }

  onDragLeave(event: DragEvent, doc: DocFile): void {
    event.preventDefault();
    doc.isDragOver = false;
  }

  onDrop(event: DragEvent, doc: DocFile): void {
    event.preventDefault();
    event.stopPropagation();
    doc.isDragOver = false;
    const files = event.dataTransfer?.files;
    if (files?.length) {
      this.attachFile(doc, files[0]);
    }
  }

  private attachFile(doc: DocFile, file: File): void {
    doc.fichier = file;
    doc.statut  = 'uploade';
  }

  // ── Remove file ──────────────────────────────────────────────────
  removeFile(doc: DocFile): void {
    doc.fichier = undefined;
    doc.statut  = 'vide';
  }

  // ── Icons ────────────────────────────────────────────────────────
  getDocIcon(statut: DocStatut): string {
    return { uploade: 'check_circle', erreur: 'cancel', avertissement: 'warning', vide: 'insert_drive_file' }[statut];
  }

  getTRIcon(statut: TRStatut): string {
    return { ok: 'check_circle', erreur: 'cancel', avertissement: 'warning', 'en-cours': 'radio_button_unchecked' }[statut];
  }

  // ── Navigation ───────────────────────────────────────────────────
  onPrevious(): void { this.stepBack.emit(); }
  onNext():     void { this.stepValidated.emit(); }
}
