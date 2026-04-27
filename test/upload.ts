import { CdkStepper } from '@angular/cdk/stepper';
import { HttpEvent, HttpEventType } from '@angular/common/http';
import { Component, Injector, OnInit, ViewChild } from '@angular/core';
import { AttachmentState, DossierAttachmentType, DossierData } from '@core/models';
import { DossierDataService, DossierDataStoreService } from '@core/services';
import { AttachmentService } from '@loan-dossier/services';
import { BaseComponent } from 'octroi-common-lib/ngx-octroi-credit-common';
import { BehaviorSubject, Observable, forkJoin, of } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';

@Component({
  selector: 'app-advanced-loan-attachments',
  templateUrl: './advanced-loan-attachments.component.html',
  styleUrls: ['./advanced-loan-attachments.component.scss']
})
export class AdvancedLoanAttachmentComponent extends BaseComponent implements OnInit {
  @ViewChild('principalStepper') principalStepper!: CdkStepper;

  dossier!: DossierData;

  private datsSubject = new BehaviorSubject<DossierAttachmentType[]>([]);
  dossierAttachmentType$: Observable<DossierAttachmentType[]> = this.datsSubject.asObservable();

  // Map: codeRefAttachmentType → AttachmentState[]
  attachmentStates: Record<string, AttachmentState[]> = {};

  // Set des types en cours d'upload → pour afficher le spinner
  uploadingTypes = new Set<string>();

  documents = [ /* ... garde ton array existant ... */ ];

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
  }

  isUploading(datCode: string): boolean {
    return this.uploadingTypes.has(datCode);
  }

  getUploadedCount(datCode: string): number {
    return (this.attachmentStates[datCode] ?? []).filter(a => !a.notUploaded).length;
  }

  onAddAttachments(datCode: string, newStates: AttachmentState[]): void {
    // On filtre uniquement les nouveaux fichiers (pas encore uploadés)
    const toUpload = newStates.filter(a => !a.uploaded);
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

    // Upload tous en parallèle, puis refresh le type concerné
    forkJoin(uploads$).pipe(
      finalize(() => {
        this.uploadingTypes.delete(datCode);
        this.refreshAttachmentType(datCode);
      })
    ).subscribe(events => {
      // Traitement des events HTTP si nécessaire (progress etc.)
      // Note: forkJoin attend le dernier event (Response) — pour le progress,
      // il faut garder subscribe individuel (voir méthode alternative ci-dessous)
    });
  }

  // Alternative avec progress par fichier (si tu veux garder le progress bar)
  onAddAttachmentsWithProgress(datCode: string, newStates: AttachmentState[]): void {
    const toUpload = newStates.filter(a => !a.uploaded);
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

  onPreviewAttachment(event: any): void {
    console.log({ event });
  }

  onDeleteAttachment(event: any): void {
    console.log({ event });
  }

  nextStep = () => this.principalStepper?.next();
  previousStepper = () => this.principalStepper?.previous();
  doneStepper = () => { /* ta logique */ };

  // ─── Private ───────────────────────────────────────────

  private loadDossierAttachmentTypes(): void {
    this.dossierDataService.getDossierAttachmentTypes(this.dossier.uuid!).subscribe({
      next: (dats: DossierAttachmentType[]) => {
        this.datsSubject.next(dats);
        this.attachmentStates = this.buildAttachmentStates(dats);
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
        this.datsSubject.next(dats);
        // Mise à jour ciblée du type uploadé
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
}
