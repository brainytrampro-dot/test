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
        this.iaResultsSubject.next(dats.filter((dat: DossierAttachmentType) => dat.attachments.length > 0));
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
        this.iaResultsSubject.next(dats.filter((dat: DossierAttachmentType) => dat.attachments.length > 0));
        const updatedDat = dats.find(d => d.codeRefAttachmentType === datCode);
        if (updatedDat) {
          this.attachmentStates = {
            ...this.attachmentStates,
            [datCode]: this.mapToAttachmentStates(updatedDat)
          };
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

}
