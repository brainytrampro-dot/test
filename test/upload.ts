import { CdkStepper } from '@angular/cdk/stepper';
import { HttpEvent, HttpEventType } from '@angular/common/http';
import {
  Component,
  Injector,
  OnInit,
  ViewChild
} from '@angular/core';
import { AttachmentState, DossierAttachmentType, DossierData } from '@core/models';
import { DossierDataService, DossierDataStoreService } from '@core/services';
import { AttachmentService } from '@loan-dossier/services';
import { BaseComponent } from 'octroi-common-lib/ngx-octroi-credit-common';
import { BehaviorSubject, Observable } from 'rxjs';

@Component({
  selector: 'app-advanced-loan-attachments',
  templateUrl: './advanced-loan-attachments.component.html',
  styleUrls:  ['./advanced-loan-attachments.component.scss']
})
export class AdvancedLoanAttanchmentComponent extends BaseComponent implements OnInit {
  @ViewChild('principalStepper') principalStepper!: CdkStepper;
  dossier!: DossierData;
  datsSubject= new BehaviorSubject<DossierAttachmentType[]>([]);
  dossierAttachmentType$: Observable<DossierAttachmentType[]> = this.datsSubject.asObservable();
  attachmentStates: {[key: string]: AttachmentState[]}   = {};
  savedDossierAttachmentTypes$!: Observable<DossierAttachmentType[]>;
  documents = [
    {
      name: "Carte d’identité Nationale",
      type: "CIN",
      status: "Conforme",
      statusClass: "ok",
      ocr: 91,
      actionType: "ok",
      details: [
        { field: "Nom", ocrValue: "DOGCNOIYIX", clientValue: "DOGCNOIYIX", confidence: 98 },
        { field: "Prénom", ocrValue: "DOGCNOIYIX", clientValue: "DOGCNOIYIX", confidence: 97 },
        { field: "N’CIN", ocrValue: "341092", clientValue: "341092", confidence: 99 },
        { field: "Date naissance", ocrValue: "15/03/1982", clientValue: "15/03/1982", confidence: 96 },
        { field: "Date de validité", ocrValue: "06/12/2030", clientValue: "06/12/2030", confidence: 98 },
        { field: "MRZ vs données", ocrValue: "Cohérence recto/verso validée", clientValue: "", confidence: 100 }
      ]
    },
    { name: "Attestation de salaire", type: "Attest_sal", status: "Conforme", statusClass: "ok", ocr: 93, actionType: "ok", details: [] },
    { name: "Bulletins de Paie (x3)", type: "Bulletin", status: "À vérifier", statusClass: "warn", ocr: 79, actionType: "replace", details: [] },
    { name: "Compromis de vente", type: "Compromis", status: "Non conforme", statusClass: "ko", ocr: 46, actionType: "replace", details: [] },
    { name: "Relevé de compte", type: "Releve", status: "En traitement", statusClass: "traitement", ocr: 0, actionType: "loading", details: [] }
  ];

  constructor(
    injector: Injector, 
    private dossierStore: DossierDataStoreService, 
    private attachmentService: AttachmentService,
    private dossierDataService: DossierDataService,
  ){
    super(injector);
  }

  ngOnInit() {
    this.dossier =  this.dossierStore.get();
    this.getDossierAttachmentTypes(this.dossier.uuid!);
  }

  nextStep = () => {
    if (this.principalStepper) {
      this.principalStepper.next();
    }
  }

  previousStepper = () => {
    this.principalStepper?.previous();
  }

  doneStepper = () => {
    // Ta logique
  }

  onPreviewAttachment(event: any) {
    console.log({event});
    
  }
  onDeleteAttachment(event: any) {
    console.log({event});
    
  }

  onAddAttachments(datCode: string, _attachmentStates: AttachmentState[]) {
    for (let attachment of _attachmentStates) {
      let total = 0;
      let loaded = 0;
      this.attachmentService.upload(attachment.file, this.dossier.uuid, datCode)
        .subscribe({
          next: (event: HttpEvent<any>) => {
            ({ total, loaded } = this.processResponse(event, attachment, _attachmentStates, total, loaded));
          },
          error: (error) => {
            this.processError(attachment, _attachmentStates, error);
          }
        });
    }
  }
  
  private processError(attachment: AttachmentState, _attachmentStates: AttachmentState[], error: any) {
    attachment.notUploaded = true;
  }

  private processResponse(event: HttpEvent<any>, attachment: AttachmentState, _attachmentStates: AttachmentState[], total: number, loaded: number) {
    switch (event.type) {
      case HttpEventType.Sent:
        attachment.sent = true;
        break;
      case HttpEventType.UploadProgress:
        total = event.total ? event.total : 1;
        loaded = event.loaded;
        attachment.progress = Math.round(((loaded * 0.85) / total) * 100);
        break;
      case HttpEventType.Response:
        attachment.progress = Math.round((loaded / total) * 100);
        attachment.notUploaded = false;
        this.showSuccessMessage({
          bodyKey: 'dossier.attachment.uploaded.message.body'
        });
        break;
    }
    return { total, loaded };
  }
  
  private getDossierAttachmentTypes(dossierUuid:  string) {
    this.dossierDataService.getDossierAttachmentTypes(this.dossier.uuid!).subscribe({
      next: (dats: DossierAttachmentType[]) => {
        this.datsSubject.next(dats);
        this.attachmentStates = dats.reduce((acc: {[key: string]: AttachmentState[]}, item) => {
          acc[item.codeRefAttachmentType] = item.attachments.map((attachment) => {
            return new AttachmentState(
              attachment.uuid,
              100,
              true,
              attachment.byteSize,
              new File([], attachment.filename, { type: attachment.contentType }),
              false,
              true,
              ""
            );
          })

          return acc;
        }, {});
      },
      error: (err) => {
        this.datsSubject.next([]);
        this.logService.error(err);
      }
    })
  }
}
