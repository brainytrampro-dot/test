import { CdkStepper } from '@angular/cdk/stepper';
import { HttpEvent, HttpEventType } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, EventEmitter, Injector, OnInit, Output, ViewChild } from '@angular/core';
import { Attachment, AttachmentState, DossierAttachmentType, DossierData } from '@core/models';
import { DossierDataService, DossierDataStoreService } from '@core/services';
import { DocumentViewerComponent } from '@loan-dossier/components/display/document-viewer/document-viewer.component';
import { AttachmentService } from '@loan-dossier/services';
import { BaseComponent } from 'octroi-common-lib/ngx-octroi-credit-common';
import { BehaviorSubject, Observable, forkJoin, of } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';

interface CoherenceDetails {
  field: string
  Nom: string
  ocrValue: string
  clientValue: string
  confidence: number
}

interface CoherenceAttachment {
  name: string;
  type: string;
  status: string;
  statusClass: string;
  ocr: string;
  actionType: string;
  details: CoherenceDetails[];
}

@Component({
  selector: 'app-advanced-loan-attachments',
  templateUrl: './advanced-loan-attachments.component.html',
  styleUrls: ['./advanced-loan-attachments.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdvancedLoanAttachmentComponent extends BaseComponent implements OnInit {
  @ViewChild('principalStepper') principalStepper!: CdkStepper;
  @Output() validation = new EventEmitter<any>();

  dossier!: DossierData;

  private datsSubject = new BehaviorSubject<DossierAttachmentType[]>([]);
  dossierAttachmentType$: Observable<DossierAttachmentType[]> = this.datsSubject.asObservable();
  attachmentStates: Record<string, AttachmentState[]> = {};
  uploadingTypes = new Set<string>();
  mandatoryCount: number = 0;
  private iaResultsSubject = new BehaviorSubject<any[]>([]);
  iaResults$ = this.iaResultsSubject.asObservable();
  documents: CoherenceAttachment[] = [];
  constructor(
    injector: Injector,
    private dossierStore: DossierDataStoreService,
    private attachmentService: AttachmentService,
    private dossierDataService: DossierDataService,
  ) {
    super(injector);
  }

  ngOnInit(): void {
    this.dossier = this.dossierStore.get();
    this.loadDossierAttachmentTypes();
    this.attachmentService.attachmentsTypes$.subscribe((dats) => {
      if(this.dossier.uuid){
        this.dossierDataService.getCoherenceValidation(this.dossier.uuid).subscribe({
          next: (data: CoherenceAttachment[]) =>{
            this.documents = [...data];
            this.changeDetectorRef.detectChanges();
          },
          complete: () => {
          }
        })
      }
    })
  }

  isUploading(datCode: string): boolean {
    return this.uploadingTypes.has(datCode);
  }

  getUploadedCount(datCode: string): number {
    return (this.attachmentStates[datCode] ?? []).filter(a => !a.notUploaded).length;
  }

  onAddAttachments(datCode: string, newStates: AttachmentState[]): void {
    const toUpload = newStates.filter(a => a.notUploaded);
    if (toUpload.length === 0) return;

    this.uploadingTypes.add(datCode);

    const uploads$ = toUpload.map(attachment =>
      this.attachmentService.upload(attachment.file, this.dossier.uuid, datCode).pipe(
        catchError(err => {
          attachment.notUploaded = true;
          this.logService.error(err);
          return of(null);
        })
      )
    );

    forkJoin(uploads$).pipe(
      finalize(() => {
        this.uploadingTypes.delete(datCode);
        this.refreshAttachmentType(datCode);
      })
    ).subscribe(events => {
      
    });
  }

  onAddAttachmentsWithProgress(datCode: string, newStates: AttachmentState[]): void {
    const toUpload = newStates.filter(a => a.notUploaded);
    if (toUpload.length === 0) return;

    this.uploadingTypes.add(datCode);
    let completed = 0;

    for (const attachment of toUpload) {
      let total = 0;
      let loaded = 0;

      this.attachmentService.upload(attachment.file, this.dossier.uuid, datCode).subscribe({
        next: (event: HttpEvent<any>) => {
          ({ total, loaded } = this.processHttpEvent(event, attachment, total, loaded));
        },
        error: (err) => {
          attachment.notUploaded = true;
          this.logService.error(err);
          this.checkAllDone(datCode, ++completed, toUpload.length);
        },
        complete: () => {
          this.checkAllDone(datCode, ++completed, toUpload.length);
        }
      });
    }
  }

  onPreviewAttachment(dat: DossierAttachmentType, attachmentState: AttachmentState): void {
    if (!this.dossier.uuid || !dat) return;
  
    const minimalAttachment: Attachment = {
      uuid: attachmentState.uuid,
      filename: attachmentState.file.name,
      contentType: attachmentState.file.type,
      byteSize: attachmentState.file.size,
      path: `${this.dossier.uuid}/${dat.codeRefAttachmentType}`,
      type: dat.refAttachmentTypeDesignation,
      description: dat.refAttachmentTypeDescription,
      isDeletable: false,
      canValidate: false,
      extension: '',
      storageDocumentId: 0,
      uploadedAt: '',
      uploadedBy: '',
      controls: [],
      comments: [],
      dossierAttachmentTypeUuid: dat.uuid,
      attachmentTypeCode: dat.codeRefAttachmentType,
      interventions: []
    };
  
    this.dossierDataService.downloadAttachment(minimalAttachment).subscribe({
      next: (base64: string) => {
        const prefixedBase64 = `data:${minimalAttachment.contentType};base64,${base64}`;
        this.openDialog(DocumentViewerComponent, {
          attachment: minimalAttachment,
          type: minimalAttachment.type,
          base64Payload: prefixedBase64
        });
      },
      error: (err) => {
        this.logService.error(err);
        this.showErrorMessage({ bodyKey: 'dossier.attachment.not.downloaded.message.body' });
      }
    });
  }

  onDeleteAttachment(dat: DossierAttachmentType, attachmentState: AttachmentState) {
    this.attachmentService.doProcessAttachmentDeletion(()=> {
      this.attachmentService.delete(attachmentState.uuid)
      .subscribe(
        data => {
          this.showSuccessMessage({
            bodyKey: 'dossier.attachment.deleted.message.body'
          });
          this.uploadingTypes.delete(dat.codeRefAttachmentType);
          this.refreshAttachmentType(dat.codeRefAttachmentType);
          this.changeDetectorRef.detectChanges();
        }
      );
    });
  }

  nextStep = () => {
    this.principalStepper?.next();
  }

  previousStepper = () => this.principalStepper?.previous();
  doneStepper = () => { this.validation.emit(); };

  private loadDossierAttachmentTypes(): void {
    this.dossierDataService.getDossierAttachmentTypes(this.dossier.uuid!).subscribe({
      next: (dats: DossierAttachmentType[]) => {
        this.datsSubject.next(dats);
        this.attachmentStates = this.buildAttachmentStates(dats);   
        this.mandatoryCount = dats.filter((dat: DossierAttachmentType) => dat.mandatory).length;
        this.attachmentService.attachmentsTypes = dats;
        const resultAi = dats
        .filter(dat => dat.attachments.length > 0)
        .flatMap((dat: DossierAttachmentType) => ({
          ...this.fakeIaResult[dat.codeRefAttachmentType], 
          refAttachmentTypeDesignation: dat.refAttachmentTypeDesignation,
          code: dat.codeRefAttachmentType
        }));

        this.iaResultsSubject.next(resultAi);
      },
      error: (err) => {
        this.datsSubject.next([]);
        this.logService.error(err);
      }
    });
  }

  // Refresh uniquement le type concerné après upload
  private refreshAttachmentType(datCode: string): void {
    this.dossierDataService.getDossierAttachmentTypes(this.dossier.uuid!).subscribe({
      next: (dats: DossierAttachmentType[]) => {
        this.attachmentService.attachmentsTypes = dats;
        this.datsSubject.next(dats);
        const updatedDat = dats.find(d => d.codeRefAttachmentType === datCode);
        if (updatedDat) {
          this.attachmentStates = {
            ...this.attachmentStates,
            [datCode]: this.mapToAttachmentStates(updatedDat)
          };
           const resultAi = dats
          .filter(dat => dat.attachments.length > 0)
          .flatMap((dat: DossierAttachmentType) => ({
            ...this.fakeIaResult[dat.codeRefAttachmentType], 
            refAttachmentTypeDesignation: dat.refAttachmentTypeDesignation,
            code: dat.codeRefAttachmentType
          }));

          this.iaResultsSubject.next(resultAi);
        }
        this.showSuccessMessage({ bodyKey: 'dossier.attachment.uploaded.message.body' });
      },
      error: (err) => this.logService.error(err)
    });
  }

  private checkAllDone(datCode: string, completed: number, total: number): void {
    if (completed === total) {
      this.uploadingTypes.delete(datCode);
      this.refreshAttachmentType(datCode);
    }
  }

  private buildAttachmentStates(dats: DossierAttachmentType[]): Record<string, AttachmentState[]> {
    return dats.reduce((acc, dat) => {
      acc[dat.codeRefAttachmentType] = this.mapToAttachmentStates(dat);
      return acc;
    }, {} as Record<string, AttachmentState[]>);
  }

  private mapToAttachmentStates(dat: DossierAttachmentType): AttachmentState[] {
    return dat.attachments.map(attachment =>
      new AttachmentState(
        attachment.uuid,
        100,
        true,
        attachment.byteSize,
        new File([], attachment.filename, { type: attachment.contentType }),
        false,
        true,
        ''
      )
    );
  }

  private processHttpEvent(
    event: HttpEvent<any>,
    attachment: AttachmentState,
    total: number,
    loaded: number
  ): { total: number; loaded: number } {
    switch (event.type) {
      case HttpEventType.Sent:
        attachment.sent = true;
        break;
      case HttpEventType.UploadProgress:
        total = event.total ?? 1;
        loaded = event.loaded;
        attachment.progress = Math.round(((loaded * 0.85) / total) * 100);
        break;
      case HttpEventType.Response:
        attachment.progress = 100;
        attachment.notUploaded = false;
        break;
    }
    return { total, loaded };
  }

  hasAttachments(datCode: string): boolean {
    return this.attachmentService.getDossierAttachmentTypes().some((dat: DossierAttachmentType) => dat.codeRefAttachmentType === datCode && dat.attachments.length > 0);
  }

  fakeIaResult: any = {
  "ENGAGEMENTRESTITUTIONAIDEFORFAITAIRE": {
    "message": "Le document est conforme.",
    "status": "ok"
  },
  "CARTEADHESIONFONDATIONMOHAMED": {
    "message": "La carte d'adhésion est manquante ou périmée.",
    "status": "bad"
  },
  "ORDREDEBLOCAGEPROFITPROMOTEUR": {
    "message": "L'échéancier doit être joint à l'ordre de déblocage.",
    "status": "warn"
  },
  "ENGAGEMENTPROMOTEURFAVEURBANQUE": {
    "message": "L'engagement du promoteur est conforme.",
    "status": "ok"
  },
  "NOTIFICATION": {
    "message": "Document illisible, merci de re-scanner l'original.",
    "status": "bad"
  },
  "RELVEBANCPRO": {
    "message": "Il manque les relevés des deux derniers mois.",
    "status": "warn"
  },
  "JUSTIFACTIVITEREGLEMENTE": {
    "message": "Le justificatif d'activité est conforme.",
    "status": "ok"
  },
  "AUTORISATIONCONSTRUIRE": {
    "message": "Autorisation de construire conforme.",
    "status": "ok"
  },
  "BULLTACH": {
    "message": "Signature manquante sur le bulletin ACH.",
    "status": "bad"
  },
  "SCIP": {
    "message": "Document SCIP validé.",
    "status": "ok"
  },
  "DOMIREVENU": {
    "message": "L'engagement doit être légalisé par l'employeur.",
    "status": "warn"
  },
  "CONTRATTRAVAIL": {
    "message": "Le contrat de travail est conforme.",
    "status": "ok"
  },
  "DEMANDE_EXPETISE": {
    "message": "La demande d'expertise est conforme.",
    "status": "ok"
  },
  "RAPPORT_EXPETISE": {
    "message": "Le rapport d'expertise est expiré (plus de 6 mois).",
    "status": "bad"
  },
  "DEMANDE_EXPETISE_SIGNED": {
    "message": "Signature non conforme à la CIN.",
    "status": "bad"
  },
  "DECLARATIONHONNEURHABITATIONPRINCIPALE2": {
    "message": "Mention 'Légalisée' manquante sur le document.",
    "status": "warn"
  },
  "CERTIFICATNONIMPOSITION2": {
    "message": "Le certificat est conforme.",
    "status": "ok"
  },
  "ETATENGAGEMENTIMTILAK2": {
    "message": "L'état d'engagement est conforme.",
    "status": "ok"
  },
  "ATTESTATIONIMPOSITION": {
    "message": "Manque l'attestation de propriété liée au bien figurant sur l'imposition.",
    "status": "warn"
  },
  "CARTEFONDATIONHASSAN2": {
    "message": "Document conforme.",
    "status": "ok"
  },
  "CERTIFICATE_PROPRIETE": {
    "message": "Le certificat date de plus de 3 mois.",
    "status": "bad"
  },
  "CARTEADHESIONFONDATIONMOHAMMEDIA": {
    "message": "Document conforme.",
    "status": "ok"
  },
  "ENGAGEMENTBENRELIQUAT": {
    "message": "L'engagement est conforme.",
    "status": "ok"
  },
  "LETTREACCORDVALID": {
    "message": "La lettre d'accord est conforme.",
    "status": "ok"
  },
  "DECLHONNEURNONPROPBIEN": {
    "message": "La déclaration doit être signée et légalisée.",
    "status": "warn"
  },
  "ENGAGHONNEURNONPERCEPAIDE": {
    "message": "Document conforme.",
    "status": "ok"
  },
  "ETATENGAGEMENTNONPPR": {
    "message": "Document conforme.",
    "status": "ok"
  },
  "ETATENGAGEMENTIMTILAK": {
    "message": "L'état d'engagement est conforme.",
    "status": "ok"
  },
  "SAISIEGARANTIE": {
    "message": "Contrôle effectué et validé.",
    "status": "ok"
  },
  "OPCS": {
    "message": "L'OPC n'est pas signé par le client.",
    "status": "bad"
  },
  "AUTRESDOCUMENTS": {
    "message": "Documents complémentaires requis selon le dossier.",
    "status": "warn"
  },
  "CHEQUEBANQUE": {
    "message": "Le chèque de banque est conforme.",
    "status": "ok"
  },
  "OPC": {
    "message": "L'OPC est conforme.",
    "status": "ok"
  },
  "MINUTE": {
    "message": "Minute notariale conforme.",
    "status": "ok"
  },
  "ENGAGEMENTNOTAIRE": {
    "message": "L'engagement du notaire est manquant.",
    "status": "bad"
  },
  "AUTORISATIONJUGE": {
    "message": "L'autorisation du juge est conforme.",
    "status": "ok"
  },
  "CINMANDATAIRE": {
    "message": "La CIN du mandataire est expirée.",
    "status": "bad"
  },
  "ATTESTATIONPENSION": {
    "message": "L'attestation de pension est conforme.",
    "status": "ok"
  },
  "DEVISAMENAGEMENT": {
    "message": "Le devis doit être détaillé par poste de dépense.",
    "status": "warn"
  },
  "BUTAAIMTCUS": {
    "message": "Le bulletin d'adhésion est conforme.",
    "status": "ok"
  },
  "ACCEPTASSUR": {
    "message": "L'acceptation d'assurance est validée.",
    "status": "ok"
  },
  "DCHARGEASSUR": {
    "message": "Décharge assurance conforme.",
    "status": "ok"
  },
  "DCHARGEASSURLMV": {
    "message": "La délégation externe nécessite l'accord du siège.",
    "status": "warn"
  },
  "AUTORISATIONAMENAGEMENT": {
    "message": "L'autorisation d'aménagement est conforme.",
    "status": "ok"
  },
  "DEVISCONSTRUCTION": {
    "message": "Le devis de construction est conforme.",
    "status": "ok"
  },
  "PLANARCHITECTEAPPROUVE": {
    "message": "Le plan ne comporte pas le cachet 'Approuvé' des autorités.",
    "status": "bad"
  },
  "DECLARATIONHONNEURFONDETATIQUE": {
    "message": "Déclaration conforme.",
    "status": "ok"
  },
  "IDCARD": {
    "message": "La pièce d'identité est conforme.",
    "status": "ok"
  },
  "STADEAVANCEMENTTRAVAUXCONSTRUCTION": {
    "message": "L'attestation doit être signée par l'architecte du projet.",
    "status": "warn"
  },
  "CAUTIONRESTITUTIONACOMPTE": {
    "message": "La subrogation est conforme.",
    "status": "ok"
  },
  "ORIGINALCAUTION": {
    "message": "L'original est requis, la copie n'est pas acceptée.",
    "status": "bad"
  },
  "CAHIERCHARGESSIGNE": {
    "message": "Signature de l'une des parties manquante sur le cahier des charges.",
    "status": "bad"
  },
  "ORDREDEBLOCAGE": {
    "message": "L'ordre de déblocage est conforme.",
    "status": "ok"
  },
  "CONTRATAFFECTATION": {
    "message": "Le contrat d'affectation est conforme.",
    "status": "ok"
  },
  "CARTEPROAUTOEXERCER": {
    "message": "Document conforme.",
    "status": "ok"
  },
  "JUSTIFICATIFACTIVITE": {
    "message": "Le bilan joint n'est pas certifié.",
    "status": "warn"
  },
  "STATUTPVASSEMBLE": {
    "message": "Les statuts sont conformes.",
    "status": "ok"
  },
  "DECLARATIONFISCALELAST": {
    "message": "La déclaration fiscale est conforme.",
    "status": "ok"
  },
  "SIXLASTRELEVEBANCAIRE": {
    "message": "Il manque les relevés de deux mois sur les six demandés.",
    "status": "warn"
  },
  "DOCUMENTSREVENUSPROFESSIONNELETCOMPLEMENTAIRES": {
    "message": "Documents conformes.",
    "status": "ok"
  },
  "RCPATENTEAUTOEXERCER": {
    "message": "La patente n'est pas à jour pour l'année en cours.",
    "status": "bad"
  },
  "AVISIMPOSITION": {
    "message": "L'avis d'imposition est conforme.",
    "status": "ok"
  },
  "ENGAGEMENTCESSIONCREANCE": {
    "message": "L'engagement est conforme.",
    "status": "ok"
  },
  "LDN": {
    "message": "La lettre de désignation est conforme.",
    "status": "ok"
  },
  "ETATENGAGEMENT": {
    "message": "L'état d'engagement est conforme.",
    "status": "ok"
  },
  "CINCAUTION": {
    "message": "La CIN de la caution est conforme.",
    "status": "ok"
  },
  "ATTESTATIONDECLACNSS": {
    "message": "Attestation CNSS conforme.",
    "status": "ok"
  },
  "BULLETINPAIE": {
    "message": "Merci de fournir les 3 derniers bulletins de paie.",
    "status": "warn"
  },
  "COMPROMISCONTRAT": {
    "message": "Le compromis de vente est conforme.",
    "status": "ok"
  },
  "LOANBUREAU": {
    "message": "Le rapport Crédit Bureau révèle un endettement trop élevé.",
    "status": "bad"
  },
  "DEPOTMOULKIA": {
    "message": "Le dépôt Moulkia est conforme.",
    "status": "ok"
  },
  "LDNFACULTATIVE": {
    "message": "Lettre de désignation conforme.",
    "status": "ok"
  },
  "ATTESTATIONSALAIRE": {
    "message": "L'attestation de salaire est conforme.",
    "status": "ok"
  },
  "ATTESTATIONTRAVAIL": {
    "message": "L'attestation de travail doit dater de moins d'un mois.",
    "status": "warn"
  },
  "PROCURATIONNOTARIE": {
    "message": "La procuration est conforme.",
    "status": "ok"
  },
  "PROCURATIONSOUSSEING": {
    "message": "Ce type de document n'est pas accepté pour cette opération.",
    "status": "bad"
  },
  "RELVEBANC": {
    "message": "Relevé bancaire conforme.",
    "status": "ok"
  },
  "CONTRATBAIL": {
    "message": "Le contrat de bail n'est pas enregistré.",
    "status": "warn"
  },
  "DECLARATIONHONNEURHABITATIONPRINCIPALE": {
    "message": "La déclaration est conforme.",
    "status": "ok"
  },
  "CERTIFICATNONIMPOSITION": {
    "message": "Le certificat de non imposition est conforme.",
    "status": "ok"
  },
  "JUSTIFICATIFACTIVITY": {
    "message": "Justificatifs d'activité conformes.",
    "status": "ok"
  }
}

}
