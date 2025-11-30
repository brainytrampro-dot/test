// Angular core
import { ChangeDetectionStrategy, Component, Injector, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';

// RxJS
import { Observable, Subscription } from 'rxjs';
import { take } from 'rxjs/operators';

// External libraries
import * as moment from 'moment';

// Core constants & enums
import { Permissions, Role } from '@core/constants';
import { RequestStatus } from '@loan-dossier/enumeration';
import { AttachmentType } from '@core/models/attachment-Type.enum';
import { AccordType } from '@core/models/Accord';

// Loan dossier constants
import { REQUEST_MORE_INFO_STATUS, RESPONSE_MORE_INFO_STATUS, Stage, Status } from '@loan-dossier/constants';
import { Entity } from '@statistics/constants';

// Core models
import { Attachment, CodeLabel, DossierAttachmentType, DossierData, InsuranceData, LoanData, User, WarrantyType } from '@core/models';
import { DossierUser } from '@core/models/dossier-user';
import { DossierRequest } from '@core/models/dossier-request';
import { UserrSearchCriteria } from '@core/models/UserrSearchCriteria.model';

// Core services
import { DossierDataService, DossierDataStoreService, PermissionStoreService, ReferentialService } from '@core/services';
import { UserService } from '@core/services/user.service';
import { NumberUtils } from '@core/util';

// Shared components & services
import { BaseComponent, CommentDialogComponent } from '@shared/components';
import { TimelineService } from '@shared/services';

// Loan dossier services
import { AttachmentService } from '@loan-dossier/services';

// Loan dossier components
import {
  DossierRequestsDialogComponent,
  GrantLoanDialogComponent,
  ReleaseFundDialogComponent,
  SuccessDialogComponent,
  ValidationAuthorityDialogComponent,
} from '@loan-dossier/components';
import { UpdateAccordComponent } from '@loan-dossier/components/display/update-accord/update-accord.component';
import { UserAssignationDialogComponent } from '@loan-dossier/components/display/user-assignation-dialog/user-assignation-dialog.component';
import { OpcDatesDialogComponent } from '@loan-dossier/components/opc-dates-dialog/opc-dates-dialog.component';
import { RequestDocumentsDialogComponent } from '@loan-dossier/components/request-documents-dialog/request-documents-dialog.component';
import { mapWarrantiesAndRestrictions } from '@loan-dossier/mapper/dossier-data-mapper';

// Dashboard components
import { AssignUserDialogComponent, ReassignUserDialogComponent, TransmettreDialogComponent } from '@dashboard/components';

// Local components
import { DecisionAuthorityDialogComponent } from '../decision-authority-dialog/decision-authority-dialog.component';
import { UpdateDialogComponent } from '../update-dialog/update-dialog.component';
import { DocumentViewerComponent } from '../document-viewer/document-viewer.component';
import { TransfertRiskDialogComponent } from '../tranfert-risk-dialog/tranfert-risk-dialog.component';
import { DupliquerProspect } from '../dupliquer-prospect/dupliquer-prospect.component';

// Common services
import { PermissionManagerService } from '@octroi-credit-common';


export interface DocumentDialogData {
  attachment: Attachment;
  type: AttachmentType
}

@Component({
  selector: 'app-display-dossier-view',
  templateUrl: './display-dossier-view.component.html',
  styleUrls: ['./display-dossier-view.component.scss'],
  providers: [DossierDataStoreService,PermissionStoreService, TimelineService],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DisplayDossierViewComponent extends BaseComponent implements OnInit, OnDestroy {
  permissionContants = Permissions;
  dossierData$!: Observable<DossierData>;
  toggleShow = true;
  uuid!: string | null;
  displayMode!: number;
  updateSubscription!: Subscription;
  attachmentsSubscription!: Subscription;
  attachmentsTypesSubscription!: Subscription;
  documentViewerSubscription!: Subscription;
  notificationGeneratorSubscription!: Subscription;
  isAllAttachmentControlled = false;
  isAllMandatoryAttachmentUploaded = true;
  isAllAttachmentControlledOK = false;
  isOPCAttachmentUploaded : boolean = false;
  status = Status;
  stage = Stage;
  currentDossierUser!: DossierUser | undefined;
  permissions: string[] = [];
  hasMandatoryAttachments$!: Observable<Boolean>;
  private subscription!: Subscription;
  dossierRequestSubscription!: Subscription;
  dossierRequests: any[] = [];
  authorizedActions: any[] = [];
  dossierRequestInProgress!: DossierRequest;
  lastDossierRequestAccepted!: DossierRequest;
  requestStatus= RequestStatus;
  dossierAttachmentTypes: DossierAttachmentType[] = [];
  notHasInprogressRequest : boolean = true;
  isRiskProfession!: boolean;
  rsikProfessions: string[] = ['ARR','ROR','RORE','DRR'];
  isAccordPrincipe: string | undefined;
  dossierRequest!: DossierRequest ;
  dossierData: DossierData = {};
  loanData : LoanData | undefined;
  isProspect!: boolean;
  dialogRef: any;
  countRestrictions: number = 0;
  selectedProduct: CodeLabel | undefined;

  //Authorized status for return to decision
  authorizedStatusForRID: string[] = [Status.DECS_RID_OPCD, Status.DECS_RID_OPCR,Status.AVRS_ANR_RIDN,  Status.DECS_RIDN,Status.AVRS_RIDN, Status.DECS_RS_RIND, Status.DECS_RS_FINAL_RIND];

  constructor(injector: Injector, private dossierStore: DossierDataStoreService,
              private permissionStore: PermissionStoreService,
              private activatedRoute: ActivatedRoute,
              private dossierDataService: DossierDataService,
              private timelineService: TimelineService,
              private referentialService: ReferentialService,
              private attachmentService: AttachmentService,
              public dialog: MatDialog,
              private permManager: PermissionManagerService,
              private userService: UserService  ) {
    super(injector);
    this.dossierData$ = this.dossierStore.dossierData$;
    this.hasMandatoryAttachments$ = this.dossierDataService.hasAllMandatoryAttachments$;
    this.uuid = this.activatedRoute.snapshot.paramMap.get('uuid');
    this.isRiskProfession = this.rsikProfessions.includes(userService.currentUserCodeProfession);
  }

  ngOnInit(): void {
    if (this.uuid) {
      this.dossierDataService.getDossierByUuid(this.uuid).subscribe(initialState => {
        this.referentialService.getAllStages().subscribe(data => this.timelineService.init(data.map(item => item.designation), initialState.stage));
        this.dossierStore.init(initialState);
        this.permissionStore.init(this.userService.userPermissions());
      });
      this.subscription = this.dossierStore.dossierData$.subscribe((dossierData: DossierData) => {

        this.dossierDataService.checkDossierHasMandatoryAttachments(this.uuid!,dossierData.taskStatus!);
        this.updateView(dossierData);
        this.getDossierRequests(dossierData);
        this.authorizedActions= this.getAuthorizedActions(dossierData);
        this.isAccordPrincipe= dossierData.accord;
        this.isProspect= dossierData.customerData?.personalInfo?.prospect===true;
        this.hideOPCForFront(dossierData);
        this.selectedProduct= this.dossierData.product;
      });
    }

    this.attachmentsSubscription = this.attachmentService.attachments$.subscribe((attachments: Attachment[] | undefined) => {
      if (attachments && attachments.length > 0) {
        const controls = attachments.filter(({canValidate}) => canValidate).flatMap(attachment => attachment.controls);
        this.isAllAttachmentControlled = controls.every(control => control.conform !== null && control.conform !== undefined);
        this.isAllAttachmentControlledOK = controls.every(control => control.conform);
      }
    });
  }

  loadRequestData(uuid:string){
      this.dossierDataService.getLastReassignInprogress(uuid).subscribe({
        next: (result: any) => {
         if(result){
          this.notHasInprogressRequest=false;
         }
        },
        error: () => {

        }
      })
  }

  showAddFile(dossier:DossierData):boolean{
    const isInfoCompAgency = dossier.codeStatus?.includes(Status.ADDITIONAL_AGENCY_INFORMATION);
    const isInfoCompDSC = dossier.codeStatus?.includes(Status.INFO_COMP_DSC);
    const isApproved = dossier.codeStatus?.includes(Status.DOSSIER_APPROUVED);
    const isNotApprovedYet = dossier.codeStatus?.includes(Status.DECISION);
    const isMisOrDeb = [Stage.MISENPLACE, Stage.DEBLOCAGE].includes(dossier.codeStage!);

    const others = [
      Status.A_TRAITER_DSC_CTB,
      Status.ATTENTE_RETOUR_NOTAIRE,
      Status.OPCAM_GEN,
      Status.CONTROLE_GARANTIE,
      Status.OPC_REMISE_AU_CLIENT,
      Status.OPC_SIGNE,
      Status.INCA_AANR,
      Status.OPC_WAITING_EXPERTISE,
      Status.INCA_AVRS_RANR,
      Status.INFO_COMP_DECISION_RS,
      Status.DEM_DEBP,
      Status.AGREEMENT_RISK,
      Status.AGREEMENT_RISK_ANALIST_RETAIL,
      Status.ADEB,
      Status.OPCA
    ].includes(dossier.codeStatus!);

    const expTask= [Status.REXP,Status.INCA_EXP, Status.INCA_EXPS, Status.EXPS, Status.REXPR].includes(dossier.taskStatus!);
    return dossier?.assignedToMe! && (isInfoCompAgency || isInfoCompDSC || isApproved || isNotApprovedYet || isMisOrDeb || others || expTask );

  }

  onEditDossier() {
    const dossier = this.dossierStore.get();
    if ([Status.ADDITIONAL_AGENCY_INFORMATION_DECISION,
        Status.INCA_AANR,  Status.INCA_AVRS_RANR,
        Status.INFO_COMP_DECISION_RS, Status.INFO_COMP_AGREEMENT_RISK].includes(dossier.codeStatus!)) {
      const dialogRef = this.openDialog(UpdateDialogComponent, {
        title: this.translationService.instantTranslate('dialog.updateDossier.title'),
        loanData: dossier.loanData,
        product: dossier.product,
        warranties: dossier.warranties,
        insuranceData: { ...dossier.insuranceData,
          insuranceCoefficient: NumberUtils.toForcedNumber(dossier.insuranceData?.insuranceCoefficient )
         }
      });

      dialogRef.afterClosed().subscribe(() => {
        this.updateSubscription.unsubscribe();
      });

      this.updateSubscription = dialogRef.componentInstance.validate.subscribe((data: any) => {
        this.dossierDataService.patch({...data, insuranceData: {
          ...data.insuranceData,
          insuranceCoefficient: NumberUtils.toForcedNumber(data.insuranceData?.insuranceCoefficient )},
          aditionalCreditInsuranceCoefficient: NumberUtils.toForcedNumber(data.insuranceData?.aditionalCreditInsuranceCoefficient ) ,
          typeAInsuranceCoefficient: NumberUtils.toForcedNumber(data.insuranceData?.typeAInsuranceCoefficient ) ,
          typeBInsuranceCoefficient: NumberUtils.toForcedNumber(data.insuranceData?.typeBInsuranceCoefficient ) ,
          uuid: this.uuid }).subscribe({
          next: dossier => {
            this.dossierStore.update(dossier);
            this.showSuccessMessage({bodyKey: "loan.save.success.message"});
            dialogRef.close();
          },
          error: errors => {
            this.logService.error("Error", errors);
          }
        })
      });
    } else {
      this.router.navigateByUrl('/dossiers', {state: this.dossierStore.get()});
    }
  }

  onRespenseExpertise(taskStatus:any):void{
    const dialogRef = this.openDialog(CommentDialogComponent, {
      title: taskStatus===Status.REXPR ? this.translationService.instantTranslate('dialog.validate.expertise.title')
      : this.translationService.instantTranslate('dialog.forward.title'),
      cancelButton: this.translationService.instantTranslate('button.cancel.label'),
      validateButton: this.translationService.instantTranslate('button.validate.label'),
    });

    dialogRef.componentInstance.validation.subscribe((comment: any) => {
      if (this.uuid) {
        this.dossierDataService.sendExpertiseRequest(this.uuid, comment).subscribe({
          next: (dossier) => {
            this.dossierStore.update(dossier);
            this.timelineService.nextStep();
            dialogRef.close();
            this.changeDetectorRef.detectChanges();
            this.showSuccessMessage({ bodyKey: "action.success.message" });
            this.showDialogMessage(SuccessDialogComponent);
          },
          error: (err) => {
            this.logService.error("Error", err);
            dialogRef.close();
          }
        });
      }
    });
  }

  onSendDossierToDecisionAuthority(): void {
    let dossier = this.dossierStore.get();
    if (dossier.codeStatus === this.status.COMPLIANCE_CONTROL) {
      const dialogRef = this.openDialog(DecisionAuthorityDialogComponent, {
        initiator: this.getDossierInitiator(),
        loanData: dossier.loanData,
        product: dossier.product,
      });
      dialogRef.componentInstance.validation.pipe(take(1)).subscribe((data: any) => {
        if (this.uuid) {
          const observable = data.sendToAnalysteRetail ? this.dossierDataService.sendToAnalistRetail(this.uuid, data.comment) :
          this.dossierDataService.sendToDecisionAuthority(this.uuid, data.comment, data.decisionAuthority);
          observable.subscribe({
            next: dossier => {
              this.dossierStore.update(dossier);
              this.timelineService.nextStep();
              dialogRef.close();
              this.changeDetectorRef.detectChanges();
              this.showSuccessMessage({bodyKey: "action.success.message"});
              this.showDialogMessage(SuccessDialogComponent);
            },
            error: () => {
              dialogRef.close();
            }
          });
        }
      })
    }
  }

  onResponseMoreInfo() {
    if (this.uuid) {
      this.dossierDataService.additioanalInfoFeedBack(this.uuid).subscribe({
        next: dossier => {
          this.dossierStore.update(dossier);
          this.changeDetectorRef.detectChanges();
          this.showSuccessMessage({bodyKey: "action.success.message"});
          this.showDialogMessage(SuccessDialogComponent);
        },
        error: (err) => {
          this.logService.error("Error", err);
        }
      });
    }
  }

  onRequestMoreInfo(dossier: DossierData): void {
    const isDecisionStage = dossier.codeStage?.includes(Stage.DECISION);
    const taskExp= [Status.REXP, Status.REXPR].includes(dossier.taskStatus!);
    const dialogRef = this.openDialog(CommentDialogComponent, {
      title: this.translationService.instantTranslate('dialog.moreInfo.title'),
      commentaireLabel: this.translationService.instantTranslate('dialog.moreInfo.comment.label'),
      commentairePlaceholder: this.translationService.instantTranslate('dialog.moreInfo.comment.placeholder'),
      cancelButton: this.translationService.instantTranslate('button.cancel.label'),
      validateButton: this.translationService.instantTranslate('button.validate.label'),
      codeStage: this.dossierStore.get().codeStage,
      reasonMode: !isDecisionStage && !taskExp
    });

    dialogRef.componentInstance.validation.pipe(take(1)).subscribe((data: any) => {
      const model = isDecisionStage || taskExp ? {message: data} : {...data};
      this.dossierDataService.additianalInfo(this.uuid!, model).subscribe({
        next: dossier => {
          this.dossierStore.update(dossier);
          dialogRef.close();
          this.changeDetectorRef.detectChanges();
          this.showSuccessMessage({bodyKey: "action.success.message"});
          this.showDialogMessage(SuccessDialogComponent);
        },
        error: (err) => {
          this.logService.error("Error", err);
          dialogRef.close();
        }
      });
    });
  }

  onGrantLoan() {
    let dossier = this.dossierStore.get();
    const lastNotif = this.attachmentService.getLastUploadedFileByType(AttachmentType.Notification);
    const predicate = ({attachment,type}: any) => attachment?.uuid ===lastNotif?.uuid ||  type?.includes('PROPOSED');
    const dialogRef = this.openDialog(GrantLoanDialogComponent, {
      title: lastNotif === null ? 'dialog.grant.loan.label' : 'dialog.grant.loan.label.regenerate',
      cancelButton: 'button.cancel.label',
      validateButton: 'button.notification.generate.label',
      warranties: dossier.codeStatus !== Status.DECISION  && this.lastDossierRequestAccepted ? this.lastDossierRequestAccepted?.requestWarranties: dossier.warranties,
      restrictions: dossier.codeStatus !== Status.DECISION ? dossier.restrictions?.filter(predicate) : dossier.restrictions
    });

    dialogRef.afterClosed().subscribe(() => {
      this.notificationGeneratorSubscription.unsubscribe();
    });

    this.notificationGeneratorSubscription = dialogRef.componentInstance.validate.subscribe((documentGenerator: any) => {
      if (documentGenerator != undefined && documentGenerator.warranties != undefined && this.uuid) {
        this.dossierDataService.generateNotificationDossier(this.uuid, documentGenerator).subscribe({
          next: (dossier: DossierData) => {
            this.dossierStore.update(dossier);
            this.onShowDocumentViewer(dossier?.dossierAttachmentTypes?.slice(-1)[0].attachments[0], AttachmentType.Notification);
            this.showSuccessMessage({bodyKey: "action.success.message"});
            dialogRef.close();
          },
          error: (err) => {
            this.logService.error("Error", err);
          }
        });
      } else {
        this.logService.error("Generation of notification of the dossier should have warranties and/or restrictions.");
      }
      this.changeDetectorRef.detectChanges();
    })
  }

  onRejectDialog() {
    const dialogRef = this.openDialog(CommentDialogComponent, {
      title: this.translationService.instantTranslate('dialog.reject.dossier.title'),
      commentaireLabel: this.translationService.instantTranslate('dialog.reject.dossier.comment.label'),
      commentairePlaceholder: this.translationService.instantTranslate('dialog.reject.dossier.comment.placeholder'),
      cancelButton: this.translationService.instantTranslate('button.cancel.label'),
      validateButton: this.translationService.instantTranslate('button.reject.label')
    });

    let rejectSubscription = dialogRef.componentInstance.validation.subscribe((motif: string) => {
      if (this.uuid) {
        this.dossierDataService.rejectDossier(this.uuid, motif).subscribe({
          next: dossier => {
            this.dossierStore.update(dossier);

            this.showSuccessMessage({bodyKey: "action.success.message"});
            dialogRef.close();
          }, error: () => {
            this.showErrorMessage({bodyKey: "action.error.message"});
            dialogRef.close();
          }
        });
      } else {
        this.logService.error("Dossier uuid should not be empty, undefined or null.");
      }
      this.changeDetectorRef.detectChanges();
    });

    dialogRef.afterClosed().subscribe(() => {
      rejectSubscription.unsubscribe();
    });
  }

  getDossierInitiator() {
    const dossier = this.dossierStore.get();
    return dossier.dossierUsers?.find(item => item.role.code == Role.INITIATOR)?.user;
  }

  ngOnDestroy() {
    this.attachmentsSubscription.unsubscribe();
    if (this.subscription) this.subscription.unsubscribe();
  }

  onDetectChange(event: boolean) {
    if (event) {
      this.changeDetectorRef.detectChanges();
    }
  }

  onShowDocumentViewer(attachment?: Attachment, attachmentType?: any) {
    if (attachment) {
      let dialogData: DocumentDialogData = {attachment: attachment, type: attachmentType};
      const dialogRef = this.openDialog(DocumentViewerComponent, dialogData);

      dialogRef.afterClosed().subscribe(() => {
        this.documentViewerSubscription.unsubscribe();
        this.attachmentService.attachmentsChange = true;
        this.changeDetectorRef.detectChanges();
      });

      this.documentViewerSubscription = dialogRef.componentInstance.closing.subscribe(() => {
        dialogRef.close();
      });
    }
  }

  onSendDossier() {
    if (this.uuid) {
      const flag = this.dossierRequestInProgress ? RequestStatus.CLOSED: RequestStatus.INIT;
      this.dossierDataService.approveDossier(this.uuid, flag).subscribe({
        next: dossier => {
          this.dossierStore.update(dossier);
          this.changeDetectorRef.detectChanges();
          this.showSuccessMessage({bodyKey: "action.success.message"});
          this.showDialogMessage(SuccessDialogComponent);
        },
        error: (err) => {
          this.logService.error("Error", err);
        }
      });
    }
  }

  onSendBackToDecision() {
    const dossier = this.dossierStore.get();
    const title = this.translationService.instantTranslate('dialog.send.backToDecision.title');
    if ([Status.DOSSIER_APPROUVED, Status.INCA_GEN,Status.DOSSIER_AVIS_RISK_APPROUVED, Status.INCA_RIDN, Status.DECS_ANR_INCA_RIDN, Status.AVRS_INCA_RIDN, Status.AVRS_ANR_INCA_RIDN, Status.DOSSIER_APPROUVED_RISK, Status.DECS_RS_INCA_RIDN,  Status.DECS_RS_FINAL_RIND, Status.DECS_RS_FINAL_INCA_RIDN, Status.OPC_REMISE_AU_CLIENT].includes(dossier.codeStatus!) && dossier?.returnDecisionInstance) {
      const dialogRef = this.openDialog(UpdateDialogComponent, { title, ...this.prepareDialogData() });
      this.updateSubscription = dialogRef.componentInstance.validate.subscribe((data: any) => {
        if (this.uuid) {
          let dossierRequest: DossierRequest = {
              claimedAmountOfPurchase: data.loanData.claimedAmountOfPurchase,
              claimedAmountOfBuildDevelopment: data.loanData.claimedAmountOfBuildDevelopment,
              typeRate: data.loanData.rateType.code,
              creditRate: data.loanData.rate,
              deadlineNumber: data.loanData.deadlineNumber,
              typeAloanAmount: data.loanData.typeAloanAmount,
              typeBloanAmount:data.loanData.typeBloanAmount,
              additionalCredit:data.loanData.additionalCredit,
              typeAloanRate:data.loanData.typeAloanRate,
              typeBloanRate:data.loanData.typeBloanRate,
              additionalCreditRate:data.loanData.additionalCreditRate,
              typeAloanDuration:data.loanData.typeAloanDuration,
              typeBloanDuration:data.loanData.typeBloanDuration,
              additionalLoanDuration:data.loanData.additionalLoanDuration,
              insuranceCoefficient: NumberUtils.toForcedNumber(data.insuranceData?.insuranceCoefficient ) ,
              promotionalInsuranceRate:  NumberUtils.toForcedNumber(data.insuranceData?.promotionalInsuranceRate ) ,
              insuredPercentage: data.insuranceData.insuredPercentage,
              typeAInsuranceCoefficient: NumberUtils.toForcedNumber(data.insuranceData?.typeAInsuranceCoefficient ) ,
              typeAPromotionalInsuranceRate:  NumberUtils.toForcedNumber(data.insuranceData?.typeAPromotionalInsuranceRate ) ,
              typeAInsuredPercentage: data.insuranceData.typeAInsuredPercentage,
              typeBInsuranceCoefficient: NumberUtils.toForcedNumber(data.insuranceData?.typeBInsuranceCoefficient ) ,
              typeBPromotionalInsuranceRate:  NumberUtils.toForcedNumber(data.insuranceData?.typeBPromotionalInsuranceRate ) ,
              typeBInsuredPercentage: data.insuranceData.typeBInsuredPercentage,

              subsidizedInsuranceCoefficient: NumberUtils.toForcedNumber(data.insuranceData?.subsidizedInsuranceCoefficient ) ,
              subsidizedPromotionalInsuranceRate:  NumberUtils.toForcedNumber(data.insuranceData?.subsidizedPromotionalInsuranceRate ) ,
              subsidizedInsuredPercentage: data.insuranceData.subsidizedInsuredPercentage,
              bonusInsuranceCoefficient: NumberUtils.toForcedNumber(data.insuranceData?.bonusInsuranceCoefficient ) ,
              bonusPromotionalInsuranceRate:  NumberUtils.toForcedNumber(data.insuranceData?.bonusPromotionalInsuranceRate ) ,
              bonusInsuredPercentage: data.insuranceData.bonusInsuredPercentage,
              suportedInsuranceCoefficient: NumberUtils.toForcedNumber(data.insuranceData?.suportedInsuranceCoefficient ) ,
              suportedPromotionalInsuranceRate:  NumberUtils.toForcedNumber(data.insuranceData?.suportedPromotionalInsuranceRate ) ,
              suportedInsuredPercentage: data.insuranceData.suportedInsuredPercentage,
              requestedNotaryFee: NumberUtils.toForcedNumber(data.loanData?.requestedNotaryFee ) ,
              aditionalCreditInsuranceCoefficient: NumberUtils.toForcedNumber(data.insuranceData?.aditionalCreditInsuranceCoefficient ) ,
              aditionalCreditPromotionalInsuranceRate:  NumberUtils.toForcedNumber(data.insuranceData?.aditionalCreditPromotionalInsuranceRate ) ,
              aditionalCreditInsuredPercentage: data.insuranceData.aditionalCreditInsuredPercentage,
              cappedRate: data.loanData.cappedRate,
              applicationFee: data.loanData.applicationFee,
              requestWarranties: data.warranties,
              ...(data.loanData.delayed ? {
                delayType: data.loanData.delayType.code,
                delayed: data.loanData.delayed,
                delayDuration:data.loanData.delayDuration
              }: {})
          };
          this.dossierDataService.returnToDecisionInstance(this.uuid, "DEFINITIF", dossierRequest).subscribe({
            next: dossier => {
              this.dossierStore.update(dossier);
              dialogRef.close();
              this.changeDetectorRef.detectChanges();
              this.showSuccessMessage({bodyKey: "loan.save.success.message"});
            },error: (err) => {
              this.logService.error("Error", err);
              dialogRef.close();
            }
          })
        }
      });
    }
  }

  onSendAccordToDecision() {
    const dossier = this.dossierStore.get();
    const title = this.translationService.instantTranslate('Editer le dossier');
    if ((dossier.codeStatus?.includes(Status.DOSSIER_APPROUVED)||dossier.codeStatus?.includes(Status.DOSSIER_AVIS_RISK_APPROUVED)) && dossier?.accord === 'PRINCIPE') {
      const dialogRef = this.openDialog(UpdateAccordComponent, { title,dossier });
      this.updateSubscription = dialogRef.componentInstance.validate.subscribe((data: any) => {
        if (this.uuid) {
          this.dossierDataService.returnToDecisionInstance(this.uuid, dossier?.accord!, {dossier: data} as DossierRequest).subscribe({
            next: dossier => {
              this.dossierStore.update(dossier);
              dialogRef.close();
              this.changeDetectorRef.detectChanges();
              this.showSuccessMessage({ bodyKey: "loan.save.success.message" });
            }, error: (err) => {
              this.logService.error("Error", err);
              dialogRef.close();
            }
          })
        }
      });
    }
  }

  onDupliquerDossier() {
    const dossier=this.dossierStore.get();
    const title = this.translationService.instantTranslate('Dupliquer prospect');
    const dialogRef = this.openDialog(DupliquerProspect, { title, dossier });

    this.updateSubscription = dialogRef.componentInstance.validate.subscribe(
      (data: any) => {
        if (Object.keys(data).length > 0) {
          const dossier = mapWarrantiesAndRestrictions({
            ...this.dossierStore.get(),
            ...data
          });

          dialogRef.close();
          this.changeDetectorRef.detectChanges();
          this.dossierDataService.save(dossier).subscribe({
            next: (savedDossier) => {
              this.showSuccessMessage({ bodyKey: "dupliquer.success.message" });
              this.router.navigateByUrl('/dossiers', { state: savedDossier });
            },
            error: (error) => {
              this.logService.error("Erreur lors de la sauvegarde du dossier :", error);
            }
          });
        }
      }
    );
  }

  onForwardToDSC() {
    const drppCode = this.currentDossierUser?.user.drppCode;
    const dossier = this.dossierStore.get();
    if (drppCode) {
      this.userService.getUserByDRPP(drppCode).subscribe({
        next: user => {

          let users: User[] = [];
          users.push(user);
          const dialogRef = this.openDialog(UserAssignationDialogComponent, {
            title: this.translationService.instantTranslate('dialog.send.dsc.dossier.title'),
            userTitle: this.translationService.instantTranslate('dialog.send.dsc.user.title'),
            users: users,
            dossier: dossier,
            commentaireLabel: this.translationService.instantTranslate('dialog.send.dsc.dossier.comment.label'),
            commentairePlaceholder: this.translationService.instantTranslate('dialog.send.dsc.dossier.comment.placeholder'),
            cancelButton: this.translationService.instantTranslate('button.cancel.label'),
            validateButton: this.translationService.instantTranslate('button.reject.label'),
            userSelectionEnabled: false
          });
          let forwardSubscription = dialogRef.componentInstance.validation.subscribe((data: any) => {
            if (this.uuid) {
              const {comment,sendToExpertiseReview} = data;
              this.dossierDataService.forwardToDeliveryManager(this.uuid, comment,sendToExpertiseReview).subscribe({
                next: dossier => {
                  this.dossierStore.update(dossier);
                  this.timelineService.nextStep();
                  dialogRef.close();
                  this.changeDetectorRef.detectChanges();
                  this.showSuccessMessage({bodyKey: "action.success.message"});
                  this.showDialogMessage(SuccessDialogComponent);
                },
                error: (err) => {
                  this.logService.error("Error", err);
                  dialogRef.close();
                }
              });
            }

          });
         dialogRef.afterClosed().subscribe(() => {
          this.attachmentService.attachmentsChange = true;
        });
        },
        error: (e) => {
          this.logService.error("Error while retrieving dsc user: ", e);
        }
      });

    } else {
      this.logService.error("DRPP code should be not null");
    }
  }

  onAffectToCTB(dossier: any = {}){
    const dialogRef = this.openDialog(AssignUserDialogComponent, { dossier });
    dialogRef.afterClosed().subscribe((result) => {
      this.dossierStore.update(result);
      this.changeDetectorRef.detectChanges();
    });
  }

  sendOPCToSupervisor(){
    const dialogRef = this.openDialog(ValidationAuthorityDialogComponent, {});
    dialogRef.componentInstance.validation.subscribe((comment: any) => {
      if (this.uuid) {
        this.dossierDataService.sendOpcToValidate(this.uuid, comment).subscribe({
          next: (dossier) => {
            this.dossierStore.update(dossier);
            dialogRef.close();
            this.changeDetectorRef.detectChanges();
            this.showSuccessMessage({ bodyKey: "action.success.message" });
            this.showDialogMessage(SuccessDialogComponent);
          },
          error: (err) => {
              this.logService.error("Error", err);
            dialogRef.close();
          }
        });
      }
    });
  }

  onForwardToSupervisor(){
    const dialogRef = this.openDialog(CommentDialogComponent, {
      title: this.translationService.instantTranslate('dialog.forward.to.supervisor.title'),
      cancelButton: this.translationService.instantTranslate('button.cancel.label'),
      validateButton: this.translationService.instantTranslate('button.validate.label'),
    });
    dialogRef.componentInstance.validation.subscribe((comment: any) => {
      if (this.uuid) {
        this.dossierDataService.warrantyToSupervisor(this.uuid, comment).subscribe({
          next: (dossier) => {
            this.dossierStore.update(dossier);
            this.timelineService.nextStep();
            dialogRef.close();
            this.changeDetectorRef.detectChanges();
            this.showSuccessMessage({ bodyKey: "action.success.message" });
            this.showDialogMessage(SuccessDialogComponent);
          },
          error: (err) => {
            this.logService.error("Error", err);
            dialogRef.close();
          }
        });
      }
    });
  }

  onForwardToCTB(){
    const dialogRef = this.openDialog(CommentDialogComponent, {
      title: this.translationService.instantTranslate('dialog.moreInfo.comment.label'),
      commentairePlaceholder: this.translationService.instantTranslate('dialog.send.dsc.dossier.comment.placeholder'),
      cancelButton: this.translationService.instantTranslate('button.cancel.label'),
      validateButton: this.translationService.instantTranslate('button.validate.label'),
      isRequired: false,
    });
    dialogRef.componentInstance.validation.subscribe((comment: any) => {
      if (this.uuid) {
        this.dossierDataService.additioanalInfoFeedBack(this.uuid, comment).subscribe({
          next: (dossier) => {
            this.dossierStore.update(dossier);
            dialogRef.close();
            this.changeDetectorRef.detectChanges();
            this.showSuccessMessage({ bodyKey: "action.success.message" });
            this.showDialogMessage(SuccessDialogComponent);
          },
          error: (err) => {
            this.logService.error("Error", err);
            dialogRef.close();
          }
        });
      }
    });
  }

  assignToMe() {
    if (this.uuid) {
      this.dossierDataService.assignToMe(this.uuid).subscribe({
        next: dossier => {
          this.dossierStore.update(dossier);
          this.changeDetectorRef.detectChanges();
          this.showSuccessMessage({bodyKey: "action.success.message"});
        },
        error: (err) => {
          this.logService.error("Error", err);
        }
      });
      this.changeDetectorRef.detectChanges();
    }
  }

  onReturnToCTBForUpdate() {
    const dialogRef = this.openDialog(CommentDialogComponent, {
      title: this.translationService.instantTranslate('dialog.moreInfo.comment.label'),
      commentairePlaceholder: this.translationService.instantTranslate('dialog.moreInfo.comment.placeholder'),
      cancelButton: this.translationService.instantTranslate('button.cancel.label'),
      validateButton: this.translationService.instantTranslate('button.validate.label'),
    });
    dialogRef.componentInstance.validation.subscribe((comment: any) => {
      if (this.uuid) {
        let dossier = this.dossierStore.get();
        if(dossier.codeStatus === this.status.OPC_VALIDATED){
          this.onReturnToCTBFromInitiator(this.uuid,comment);
        }
        else if(dossier.assignedToMe && dossier.codeStatus === this.status.OPCA){
          this.onReturnToCTBFromSupervisor(this.uuid,comment);
        }
      }
      dialogRef.close();
    });
  }

  validateOPC(){
    if (this.uuid) {
      this.dossierDataService.validateOPC(this.uuid).subscribe({
        next: (dossier: any) => {
          this.dossierStore.update(dossier);
          this.timelineService.nextStep();
          this.changeDetectorRef.detectChanges();
          this.showSuccessMessage({bodyKey: "action.success.message"});
          this.showDialogMessage(SuccessDialogComponent);
        },
        error: (err) => {
          this.logService.error("Error", err);
        }
      });
    }
  }

  /**
   * The purpose of this method is to get return dossier for OPC modification : init -> CTB
   */
  onReturnToCTBFromInitiator(uuid : string, comment : string) {
    this.logService.log("Return dossier to ctb from initiator");
    this.dossierDataService.returnToCTBForCheck(uuid, comment).subscribe({
      next: (dossier) => {
        this.dossierStore.update(dossier);
        this.changeDetectorRef.detectChanges();
        this.showSuccessMessage({ bodyKey: "action.success.message" });
        this.showDialogMessage(SuccessDialogComponent);
      },
      error: (err) => {
        this.logService.error("Error", err);
      }
    });
  }

  /**
   * The purpose of this method is to get return dossier for OPC modification (OPC no valid) : Supervisor -> CTB
   */
  onReturnToCTBFromSupervisor(uuid : string, comment : string) {
    this.dossierDataService.returnToCTBForUpdate(uuid, comment).subscribe({
      next: (dossier) => {
        this.dossierStore.update(dossier);
        this.changeDetectorRef.detectChanges();
        this.showSuccessMessage({ bodyKey: "action.success.message" });
        this.showDialogMessage(SuccessDialogComponent);
      },
      error: (err) => {
        this.logService.error("Error", err);
      }
    });
  }

  onChangeOpcDates() {
    const dossier = this.dossierStore.get();
    const titles = {
      [Status.OPC_VALIDATED]: 'dialog.remise.OPC.label',
      [Status.OPC_REMISE_AU_CLIENT] : 'receipt.OPC.label'
    }
    const dialogRef = this.openDialog(OpcDatesDialogComponent, {
      title: this.translationService.instantTranslate(titles[dossier.codeStatus!]),
      cancelButton: this.translationService.instantTranslate('button.cancel.label'),
      validateButton: this.translationService.instantTranslate('button.validate.label'),
      dateRemise : dossier.opcDeliveryDate,
      dateRemiseDisabled : dossier.codeStatus !== Status.OPC_VALIDATED
    });

    dialogRef.componentInstance.validation.subscribe(({ dateRemise, dateReceipt} : any) => {
      if (this.uuid) {
        const payload: any = {
          dateOfReceiptOpcSigned : dateReceipt && moment(dateReceipt).format("YYYY-MM-DD"),
          opcDeliveryDate : dateRemise && moment(dateRemise).format("YYYY-MM-DD"),
        }
        this.dossierDataService.patchOpcDates(this.uuid, payload).subscribe({
          next: (dossier) => {
            this.dossierStore.update(dossier);
            this.changeDetectorRef.detectChanges();
            this.showSuccessMessage({bodyKey: "action.success.message"});
          },
          error: (err) => {
            this.logService.error("Error", err);
          }
        });
      }
      dialogRef.close();
    });
  }

  onPhysicalTransferToClient() {
    if (this.uuid) {
      this.dossierDataService.transferPhysicalDossier(this.uuid).subscribe({
        next: (dossier) => {
          this.dossierStore.update(dossier);
          this.timelineService.nextStep();
          this.changeDetectorRef.detectChanges();
          this.showSuccessMessage({ bodyKey: "action.success.message" });
          this.showDialogMessage(SuccessDialogComponent);
        },
        error: (err) => {
          this.logService.error("Error", err);
        }
      });
    }
  }

  sendToControlWarranties() {
    if (this.uuid) {
      this.dossierDataService.sendToControlWarranties(this.uuid).subscribe({
        next: (dossier) => {
          this.dossierStore.update(dossier);
          this.changeDetectorRef.detectChanges();
          this.showSuccessMessage({ bodyKey: "action.success.message" });
          this.showDialogMessage(SuccessDialogComponent);
        },
        error: (err) => {
          this.logService.error("Error", err);
        }
      });
    }
  }

  sendToNotaryRelationship() {
    const dialogRef = this.openDialog(CommentDialogComponent, {
      title: this.translationService.instantTranslate('dialog.transfer.notary.relationship.label'),
      commentairePlaceholder: this.translationService.instantTranslate('dialog.transfer.notary.relationship.placeholder'),
      cancelButton: this.translationService.instantTranslate('button.cancel.label'),
      validateButton: this.translationService.instantTranslate('button.validate.label'),
    });
    dialogRef.componentInstance.validation.subscribe((comment: any) => {
      if (this.uuid) {
          this.dossierDataService.transferToNotaryRelation(this.uuid, comment).subscribe({
              next: (dossier) => {
                  this.dossierStore.update(dossier);
                  this.showSuccessMessage({bodyKey: "action.success.message"});
                  dialogRef.close();
                  this.showDialogMessage(SuccessDialogComponent);
                  this.changeDetectorRef.detectChanges();
              },
              error: (err) => {
                this.logService.error("Error", err);
                  dialogRef.close();
              }
          });
      }
      dialogRef.close();
    });
  }

  onRequestDocuments() {
    const dialogRef = this.openDialog(RequestDocumentsDialogComponent, {
      title: this.translationService.instantTranslate('dialog.sending.date.label'),
      cancelButton: this.translationService.instantTranslate('button.cancel.label'),
      validateButton: this.translationService.instantTranslate('button.send.label'),
    });
    dialogRef.componentInstance.validation.subscribe((sendingDate: Date) => {
      if (this.uuid) {
        this.dossierDataService.notaryRequestDocuments({
          uuid: this.uuid,
          minuteRequestCommitmentDate: sendingDate && moment(sendingDate).format("YYYY-MM-DD")
        }).subscribe({
          next: (dossier) => {
            this.dossierStore.update(dossier);
            this.dossierDataService.checkDossierHasMandatoryAttachments(this.uuid!,dossier.taskStatus);
            dialogRef.close();
            this.changeDetectorRef.detectChanges();
            this.showSuccessMessage({ bodyKey: "action.success.message" });
            this.showDialogMessage(SuccessDialogComponent);
          },
          error: (err) => {
            this.logService.error("Error", err);
          }
        });
      }
    });
  }

  notaryMinutesRequest() {
    if (this.uuid) {
      this.dossierDataService.notaryMinutesRequest(this.uuid).subscribe({
        next: (dossier) => {
          this.dossierStore.update(dossier);
          this.changeDetectorRef.detectChanges();
          this.showSuccessMessage({ bodyKey: "action.success.message" });
          this.showDialogMessage(SuccessDialogComponent);
        },
        error: (err) => {
          this.logService.error("Error", err);
        }
      });
    }
  }

  onRejectWarranties() {
    const dialogRef = this.openDialog(CommentDialogComponent, {
      title: this.translationService.instantTranslate('dialog.reject.warranties.label'),
      descriptionMessage: this.translationService.instantTranslate('dialog.reject.warranties.message.label'),
      commentairePlaceholder: this.translationService.instantTranslate('dialog.reject.warranties.placeholder'),
      cancelButton: this.translationService.instantTranslate('button.cancel.label'),
      validateButton: this.translationService.instantTranslate('button.validate.label'),
    });
    dialogRef.componentInstance.validation.subscribe((comment: any) => {
      if (this.uuid) {
        this.dossierDataService.rejectWarranties(this.uuid, comment).subscribe({
          next: (dossier) => {
            this.dossierStore.update(dossier);
            dialogRef.close();
            this.changeDetectorRef.detectChanges();
            this.showSuccessMessage({bodyKey: "action.success.message"});
            this.showDialogMessage(SuccessDialogComponent);
          },
          error: (err) => {
            this.logService.error("Error", err);
            dialogRef.close();
          }
        });
      }
      dialogRef.close();
    });
  }

  returnDossier() {
    const dialogRef = this.openDialog(CommentDialogComponent, {
      title: this.translationService.instantTranslate('dialog.moreInfo.comment.label'),
      commentairePlaceholder: this.translationService.instantTranslate('dialog.moreInfo.comment.placeholder'),
      cancelButton: this.translationService.instantTranslate('button.cancel.label'),
      validateButton: this.translationService.instantTranslate('button.validate.label'),
    });
    dialogRef.componentInstance.validation.subscribe((comment: any) => {
      if (this.uuid) {
        this.dossierDataService.returnDossier(this.uuid, comment).subscribe({
          next: (dossier) => {
            this.dossierStore.update(dossier);
            this.changeDetectorRef.detectChanges();
            this.showSuccessMessage({ bodyKey: "action.success.message" });
            this.showDialogMessage(SuccessDialogComponent);
          },
          error: (err) => {
            this.logService.error("Error", err);
          }
        });
      }
      dialogRef.close();
    });
  }

  validateDossier() {
    if (this.uuid) {
      this.dossierDataService.validateDossier(this.uuid).subscribe({
        next: (dossier) => {
          this.dossierStore.update(dossier);
          this.changeDetectorRef.detectChanges();
          this.showSuccessMessage({ bodyKey: "action.success.message" });
          this.showDialogMessage(SuccessDialogComponent);
        },
        error: (err) => {
          this.logService.error("Error", err);
        }
      });
    }
  }

  additionalInfoCTBToSupervisor() {
    if (this.uuid) {
      this.dossierDataService.additionalInfoCTBToSupervisor(this.uuid).subscribe({
        next: dossier => {
          this.dossierStore.update(dossier);
          this.showSuccessMessage({bodyKey: "action.success.message"});
          this.showDialogMessage(SuccessDialogComponent);
        },
        error: (err) => {
          this.logService.error("Error", err);
        }
      });
      this.changeDetectorRef.detectChanges();
    }
  }

  onRelease(){
    const dossier = this.dossierStore.get();
    const dialogRef = this.openDialog(ReleaseFundDialogComponent, {
      title: this.translationService.instantTranslate('dialog.release.label'),
      hideTabs: [ Status.DEM_DEBP, Status.DEBP].includes(dossier.codeStatus!),
      loanAmount : NumberUtils.toForcedNumber(dossier.loanData?.loanAmount),
      amountReleased : NumberUtils.toForcedNumber(dossier.loanData?.amountReleased),
      amountToRelease : dossier.loanData?.amountToRelease && Status.DEM_DEBP !== dossier.codeStatus
      ? NumberUtils.toForcedNumber(dossier.loanData?.amountToRelease)
      : NumberUtils.toForcedNumber(dossier.loanData?.loanAmount) - NumberUtils.toForcedNumber(dossier.loanData?.amountReleased),
    });
    dialogRef.componentInstance.validation.subscribe((data: any) => {
      if (this.uuid) {
        this.dossierDataService.releaseDossier(this.uuid, data).subscribe({
          next: (dossier) => {
            this.dossierStore.update(dossier);
            this.changeDetectorRef.detectChanges();
            this.showSuccessMessage({ bodyKey: "action.success.message" });
            this.showDialogMessage(SuccessDialogComponent);
          },
          error: (err) => {
            this.logService.error("Error", err);
            this.showErrorMessage({
              bodyKey: 'error.ach.mandatory.message',
            });
          }
        });
      }
      dialogRef.close();
    });
  }

  receivePhysicalFile() {
    if (this.uuid) {
      this.dossierDataService.receivePhysicalFile(this.uuid).subscribe({
        next: (dossier) => {
          this.dossierStore.update(dossier);
          this.changeDetectorRef.detectChanges();
          this.showSuccessMessage({ bodyKey: "action.success.message" });
          this.showDialogMessage(SuccessDialogComponent);
        },
        error: (err) => {
          this.logService.error("Error", err);
        }
      });
    }
  }

  getDossierRequests(dossier: DossierData){
    const dossierUuid = dossier.uuid;
    if(dossierUuid){
      this.dossierDataService.getDossierRequests(dossierUuid).subscribe({
        next: (requests) => {
          if(requests && requests.length > 0){
            this.dossierRequests = requests;
            this.dossierRequestInProgress = requests.find((dr: any) => dr.requestStatus === RequestStatus.IN_PROGRESS);
            this.lastDossierRequestAccepted = requests
            .filter((dr: any) => dr.requestStatus === RequestStatus.ACCEPTED)
            .sort((a: any, b: any) => new Date(b.decisionDate).getTime() - new Date(a.decisionDate).getTime())[0];
            this.changeDetectorRef.detectChanges();
            if(dossier.assignedToMe && this.dossierRequestInProgress && this.authorizedStatusForRID.includes(dossier.codeStatus!)){
              this.openDossierRequestsModal(dossier);
            }
            this.authorizedActions= this.getAuthorizedActions(dossier);
          }
        },
        error: (e) => {
          this.logService.error(e);
        }
      })
    }
  }

  openDossierRequestsModal(dossierData: DossierData) {
    if(this.dialog.openDialogs.length === 0){
      const canAccessToInprogressTab = dossierData.assignedToMe && this.dossierRequestInProgress && this.authorizedStatusForRID.includes(dossierData.codeStatus!);
      const modalTitle = this.translationService.instantTranslate('dossier.requests.modal.title');
      const stageTitle = `${this.translationService.instantTranslate('dossier.stage.label')}: ${dossierData.stage}`;
      const dialogRef = this.openDialog(DossierRequestsDialogComponent, {
        title: `${modalTitle} (${stageTitle})`,
        dossierData,
        dossierRequestInProgress: this.dossierRequestInProgress,
        dossierRequests: this.dossierRequests,
        canAccessToInprogressTab,
      });

      this.dossierRequestSubscription = dialogRef.componentInstance.validation.subscribe((dossier: DossierData) => {
        if(dossier){
          this.dossierStore.update({...dossier}, true);
          dialogRef.close();
          this.changeDetectorRef.detectChanges();
          this.showSuccessMessage({ bodyKey: "action.success.message" });
        }
      });

      dialogRef.afterClosed().subscribe(() => {
        this.dossierRequestSubscription.unsubscribe();
      });
    }
  }

  checkAuthorizedRessign(dossier: any={}):void {

    this.dossierDataService.checkDossierAuthorizedReassign(dossier.uuid)
    .subscribe({
      next: (data) => {
        if (data) {
           const dialogRef = this.openDialog(ReassignUserDialogComponent, { dossier });
           dialogRef.componentInstance.validation.subscribe((dossier: DossierData) => {
            if(dossier){
              this.dossierStore.update(dossier);
              this.changeDetectorRef.detectChanges();
            }
          });
        }else{
          this.showErrorMessage({
            bodyKey: 'dossier.reaasignNotAllowed.message.body'
          });
        }
      },
      error: (err) => {
        this.logService.error("Error", err);
      }
    });

  }

  showAffectDialog(dossier: any = {}){
    if (this.userService.hasRole([Role.DELIVERY_MANAGER])){
      this.checkAuthorizedRessign(dossier);
   }else {
    const dialogRef = this.openDialog(ReassignUserDialogComponent, { dossier });
    dialogRef.componentInstance.validation.subscribe((dossier: DossierData) => {
      if(dossier){
        this.dossierStore.update(dossier);
        this.changeDetectorRef.detectChanges();
      }
    });
  }
  }

  onSendBackToDrDrpp(){
    const dialogRef = this.openDialog(CommentDialogComponent, {
      title: this.translationService.instantTranslate('dialog.demandeAvis.title'),
      commentaireLabel: this.translationService.instantTranslate('dialog.demandeAvis.comment.label'),
      commentairePlaceholder: this.translationService.instantTranslate('dialog.demandeAvis.comment.placeholder'),
      cancelButton: this.translationService.instantTranslate('button.cancel.label'),
      validateButton: this.translationService.instantTranslate('button.validate.label'),
    });
    dialogRef.componentInstance.validation.pipe(take(1)).subscribe((comment: any) => {
      if (this.uuid) {
        this.dossierDataService.sendBackToDrDrpp(this.uuid!, comment).subscribe({
          next: dossier => {
              this.dossierStore.update(dossier);
              this.showSuccessMessage({bodyKey: "action.success.message"});
              this.showDialogMessage(SuccessDialogComponent);
              dialogRef.close();
              this.changeDetectorRef.detectChanges();
          },
          error: (err) => {
            this.logService.error("Error", err);
          },
          complete: () => {
            dialogRef.close();
          }
        });
      }
    });

  }

  onTransferToDrDRPP(): void {
    let dossier = this.dossierStore.get();
    if(dossier.codeStatus === Status.INFO_COMP_RETOUR_ANALIST_RETAIL){
       this.onResponseMoreInfo();
    }else if([Status.DECS_ANR_RIDN,Status.AVRS_ANR_INCANR_RIDN].includes(dossier.codeStatus!)){
     this.onSendBackToDrDrpp();
    }else{
      const searchCriteria: UserrSearchCriteria={codeProfessions: ["DR", "DRPP"],
                                                  drCode: this.userService.currentUserDrCode,
                                                  drppCode: this.userService?.currentUserDrppCode,
                                                  isMultiSearch: true  }

      const dialogRef = this.openDialog(TransmettreDialogComponent,{
        title: this.translationService.instantTranslate("transmettre.dossier.drDrpp.title", {codeDossier: dossier.codeDossier}),
        userLabel: this.translationService.instantTranslate("DR/DRPP"),
        dossier,searchCriteria
      });
      dialogRef.componentInstance.validation.pipe(take(1)).subscribe((data: any) => {
        if (this.uuid) {
          this.dossierDataService.sendToAvisDrDRPP(this.uuid, data.matricule, data.comment).subscribe({
            next: dossier => {
              this.dossierStore.update(dossier);
              this.showSuccessMessage({bodyKey: "action.success.message"});
              this.showDialogMessage(SuccessDialogComponent);
              dialogRef.close();
              this.changeDetectorRef.detectChanges();
            },
            error: (err) => {
              this.logService.error("Error", err);
              dialogRef.close();
            }
          });
        }
      })
    }
  }

  isAuthorizedDMR(dossier: any={}):boolean {
    return this.userService.hasRole([Role.DELIVERY_MANAGER]) && [
      Status.OPCA,
      Status.A_TRAITER_DSC_CTB,
      Status.INCA_GEN,
      Status.OPC_VALIDATED,
      Status.OPCC,
      Status.OPCAM_GEN,
      Status.OPC_REMISE_AU_CLIENT,
      Status.OPC_SIGNE,
      Status.OPC_WAITING_EXPERTISE,
    ].includes(dossier.codeStatus);
  }

  showReassignMenuTrigger(dossier:any={}): boolean{
    return this.notHasInprogressRequest &&( this.permManager.isGranted([Permissions.ROLE_PP_VIEW_DOSSIER_FRONT,Permissions.ROLE_PP_VIEW_DOSSIER_BACK,Permissions.ROLE_PP_REASSIGN_IMMEDIATE_DOSSIER], this.permissions) || this.isAuthorizedDMR(dossier) );
  }

  getAuthorizedActions(dossier: DossierData){
    const actions: any =[
      {
        labelKey: "button.validDossier.label",
        class: "action-btn",
        icon: "assets/svg/valid.svg",
        isAuthorized: [Status.DECS_RIDN,  Status.AVRS_RIDN, Status.AVRS_ANR_RIDN ,Status.DECISION, Status.AGREEMENT_RISK, Status.DECISION_RS, Status.AGREEMENT_RISK_ANALIST_RETAIL, Status.DECS_RS_RIND, Status.DECS_RS_FINAL_RIND].includes(dossier.codeStatus!),
        permissions: [Permissions.ROLE_PP_ACCORD_DOSSIER],
        clickAction: () => this.onGrantLoan()
      },
      {
        labelKey: "button.rejectDossier.label",
        class: "action-btn",
        icon: "assets/svg/reject.svg",
        isAuthorized: [Status.DECISION, Status.DECISION_RS, Status.AGREEMENT_RISK, Status.AGREEMENT_RISK_ANALIST_RETAIL].includes(dossier.codeStatus!),
        permissions: [Permissions.ROLE_PP_REJECT_DOSSIER],
        clickAction: () => this.onRejectDialog()
      },
      {
        labelKey: "button.revoirProposition.label",
        class: "action-btn",
        icon: "assets/svg/revoirProposition.svg",
        isAuthorized:  [Status.DECS_RIDN , Status.AVRS_RIDN, Status.AVRS_ANR_RIDN,  Status.DECS_RS_RIND, Status.DECS_RS_FINAL_RIND].includes(dossier.codeStatus!) && this.dossierRequestInProgress?.requestStatus === this.requestStatus.IN_PROGRESS,
        permissions: [Permissions.ROLE_PP_REVIEW_REQUEST],
        clickAction: (dossier: DossierData) => this.onRequestMoreInfo(dossier)
      },
      {
        labelKey: "button.sendDossier.label",
        class: "action-btn",
        icon: "assets/svg/sendDossier.svg",
        isAuthorized: [Status.NOTIFICATION_GENERATED, Status.NOTIFICATION_GENERATED_RISK,Status.NOTIFICATION_GENERATED_RIDN,Status.NOTIF_AVRS_RIDN, Status.NOTIF_AVRS, "NOTIF_AVRS_ANR"].includes(dossier.codeStatus!),
        permissions: [Permissions.ROLE_PP_ACCORD_DOSSIER],
        clickAction: () => this.onSendDossier()
      },
       {
        labelKey: "button.risktransfert.label",
        class: "action-btn",
        icon: "assets/svg/risktransfert.svg",
        isAuthorized: [Status.DECISION, Status.AGREEMENT_RISK, Status.AGREEMENT_RISK_ANALIST_RETAIL, Status.AVRS_RIDN, Status.DECS_RIDN,Status.AVRS_ANR_RIDN].includes(dossier.codeStatus!) && !["DA","DCL"].includes(this.userService.currentUserCodeProfession!) ,
        permissions: [Permissions.ROLE_PP_TRANSFER_TO_RISK],
        clickAction: () => this.onTransfertRiskDialog()
      },
       {
         labelKey: "button.agreementrequest.label",
         class: "action-btn",
         icon: "assets/svg/agreementrequest.svg",
         isAuthorized: [Status.DECISION, Status.AGREEMENT_RISK_ANALIST_RETAIL, Status.DECS_RIDN, Status.AVRS_RIDN,Status.AVRS_ANR_RIDN].includes(dossier.codeStatus!) || ([Status.AGREEMENT_RISK].includes(dossier.codeStatus!)  && this.userService.currentUserCodeProfession === Entity.DRPP ),
         permissions: [Permissions.ROLE_PP_REQUEST_RISK_AGREEMENT],
         clickAction: () => this.onAgreementRequestDialog()
       },
        {
         labelKey: "button.agreementRisk.label",
         class: "action-btn",
         icon: "assets/svg/agreementrequest.svg",
         isAuthorized: dossier?.codeStatus === Status.DECISION_RS,
         permissions: [Permissions.ROLE_PP_TRANSFER_TO_RESP_RISK],
         clickAction: () => this.onTransferRespRiskDialog()
       },
       {
        labelKey: "button.agreementRisk.label",
        class: "action-btn",
        icon: "assets/svg/agreementrequest.svg",
        isAuthorized: dossier?.codeStatus ===  Status.DECS_RS_RIND,
        permissions: [Permissions.ROLE_PP_TRANSFER_TO_RESP_RISK],
        clickAction: () => this.onTransfertRiskDialog()
      },
      {
        labelKey: "button.RevoirGarantiesReserves.label",
        class: "action-btn",
        icon: "assets/svg/agreementrequest.svg",
        isAuthorized: [Status.DECISION_RS, Status.DECS_RIDN, Status.AVRS_RIDN,Status.AVRS_ANR_RIDN].includes(dossier.codeStatus!)  && this.userService.hasRole([Role.ANALYSIS_RISK]),
        permissions: [Permissions.ROLE_PP_UPDATE_DOSSIER],
        clickAction: (dossier: DossierData) => this.updateWarranties(dossier)
      }
    ];

    return actions.filter((act: any) => act.isAuthorized && this.permManager.isGranted(act.permissions));
  }

  onTransferRespRiskDialog(): void {
      const riskProfessions=['ARR','ROR','RORE','DRR'];
      const professions= riskProfessions.filter( p => this.userService.currentUserCodeProfession !== p );
      const dossier = this.dossierStore.get();
      const searchCriteria: UserrSearchCriteria={ codeProfessions:professions }
      const dialogRef = this.openDialog(TransmettreDialogComponent,{
        title: this.translationService.instantTranslate("transmettre.dossier.title", {codeDossier: dossier.codeDossier}),
        userLabel: this.translationService.instantTranslate("Utilisateur"),
        dossier,
        searchCriteria
      });
      dialogRef.componentInstance.validation.pipe(take(1)).subscribe((data: any) => {
        if (this.uuid) {
          this.dossierDataService.reassignDossier(this.uuid, data.matricule, data.comment,false).subscribe({
            next: (dossier) => {
              this.dossierStore.update(dossier);
              this.showSuccessMessage({ bodyKey: "action.success.message" });
              this.showDialogMessage(SuccessDialogComponent);
              this.changeDetectorRef.detectChanges();
            },
            error: (err) => {
              this.logService.error("Error", err);
            }
          });
        }
        dialogRef.close();
      })
  }

  onAgreementRequestDialog (){
      const dialogRef = this.openDialog(CommentDialogComponent, {
        title: this.translationService.instantTranslate('dialog.demandeAvis.title'),
        commentaireLabel: this.translationService.instantTranslate('dialog.demandeAvis.comment.label'),
        commentairePlaceholder: this.translationService.instantTranslate('dialog.demandeAvis.comment.placeholder'),
        cancelButton: this.translationService.instantTranslate('button.cancel.label'),
        validateButton: this.translationService.instantTranslate('button.validate.label'),
      });

      dialogRef.componentInstance.validation.pipe(take(1)).subscribe((comment: any) => {
        if (this.uuid) {
          this.dossierDataService.requestFeedBackManger(this.uuid, comment).subscribe({
            next: ({result, success}) => {
              if(success){
                this.dossierStore.update(result);
                this.showSuccessMessage({bodyKey: "action.success.message"});
                dialogRef.close();
                this.changeDetectorRef.detectChanges();
                this.showDialogMessage(SuccessDialogComponent);
              }else{
                this.showErrorMessage({bodyKey: "action.error.message"});
              }
            },
            error: (err) => {
              this.logService.error("Error", err);
            },
            complete: () => {
              dialogRef.close();
            }
          });
        }
      });

  }

  onTransfertRiskDialog (){
    let dossier = this.dossierStore.get();
    const dialogRef = this.openDialog(TransfertRiskDialogComponent, {
      title: this.translationService.instantTranslate('dialog.risktransfert.dossier.title'),
      commentaireLabel: this.translationService.instantTranslate('dialog.reject.dossier.comment.label'),
      commentairePlaceholder: this.translationService.instantTranslate('dialog.risktransfert.dossier.comment.placeholder'),
      cancelButton: this.translationService.instantTranslate('button.cancel.label'),
      validateButton: this.translationService.instantTranslate('button.transmettre.label'),
      riskeTypeTitle : this.translationService.instantTranslate('option.risktransfert.risquetype'),
      riskeTypeRegionalOption : this.translationService.instantTranslate('option.risktransfert.risquergional'),
      riskeTypeCentralOption : this.translationService.instantTranslate('option.risktransfert.risquecentral')
    });

    let rejectSubscription = dialogRef.componentInstance.validation.pipe(take(1)).subscribe(({comment}: any) => {
      if (this.uuid) {
        this.dossierDataService.riskTransfert(this.uuid!,dossier.codeStatus!, comment).subscribe({
          next: dossier => {
            this.dossierStore.update(dossier);
            dialogRef.close();
            this.changeDetectorRef.detectChanges();
            this.showSuccessMessage({bodyKey: "action.success.message"});
            this.showDialogMessage(SuccessDialogComponent);
          }, error: () => {
            this.showSuccessMessage({bodyKey: "action.error.message"});
            dialogRef.close();
          }
        });
      } else {
        this.logService.error("Dossier uuid should not be empty, undefined or null.");
      }
      this.changeDetectorRef.detectChanges();
    });

    dialogRef.afterClosed().subscribe(() => {
      rejectSubscription.unsubscribe();
    });
  }

  updateWarranties(dossier: DossierData):void {
    const lastNotif = this.attachmentService.getLastUploadedFileByType(AttachmentType.Notification);
    const predicate = ({attachment, type}: any) => attachment?.uuid ===lastNotif?.uuid || type?.includes('PROPOSED');
      const dialogRef = this.openDialog(GrantLoanDialogComponent, {
        formType: WarrantyType.PROPOSED,
        title: this.translationService.instantTranslate('button.RevoirGarantiesReserves.label'),
        cancelButton: this.translationService.instantTranslate('button.cancel.label'),
        validateButton: this.translationService.instantTranslate('button.validate.label'),
        warranties: [Status.DECS_ANR_RIDN,Status.AVRS_ANR_INCANR_RIDN].includes(dossier.codeStatus!)  && this.dossierRequestInProgress ? this.dossierRequestInProgress?.requestWarranties: dossier.warranties,
        restrictions:dossier.restrictions?.filter(predicate).map(({content,type})=>({content,type}))
      });
     dialogRef.componentInstance.validate.subscribe((data: any) => {
  const observer= this.dossierDataService.updateWarrantiesAndRestrictions(this.uuid!, data);
        observer.subscribe({
          next: (updatedDossier) => {
            const updateData = {
                warranties: updatedDossier.warranties,
                restrictions: updatedDossier.restrictions,
              };
              this.dossierStore.update(updateData,true);
            this.showSuccessMessage({bodyKey: "action.success.message"});
          },
          error: (err) => {
            this.logService.error("Error", err);
          },
          complete: () => {
            dialogRef.close();
          }
        })
        this.changeDetectorRef.detectChanges();
      })
  }

  private hideOPCForFront(dossier: DossierData): void{
    const isValid = this.userService.hasRole([Role.DECISION_AUTHORITY_WITHOUTRISK, Role.INITIATOR, Role.RISK_AUTHORITY, Role.VALIDATOR, Role.ANALYSIS_RETAIL]) &&
                    (dossier.codeStage === Stage.GENERATION_OPC || dossier.codeStatus === Status.OPCAM_GEN);

    if(!!isValid) this.attachmentService.attachments = this.attachmentService.getDossierAttachments()?.filter((at) => at.attachmentTypeCode !== AttachmentType.OPC);
  }

  private getCurrentDossierUser(dossierUsers: DossierUser[], codeStage: string): DossierUser | undefined {
    if (dossierUsers.length == 1) return dossierUsers[0];
    else if (dossierUsers.length > 1) {
      switch (codeStage) {
        case Stage.DECISION:
          return dossierUsers.find(du => du.role.code === Role.DECISION_AUTHORITY_WITHOUTRISK);
        case Stage.VALIDATION:
          return dossierUsers.find(du => du.role.code === Role.VALIDATOR);
        case Stage.INSTRUCTION:
          return dossierUsers.find(du => du.role.code === Role.INITIATOR);
      }
    }
    return undefined;
  }

  private updateView(dossier: DossierData) {
    let dossiersUsers = dossier.dossierUsers?.filter(du => du.user.matricule == this.userService.currentUserMatricule);
    if (dossiersUsers && dossier.codeStage) {
      this.currentDossierUser = this.getCurrentDossierUser(dossiersUsers, dossier.codeStage);
    } else {
      this.logService.error("dosser without any user");
    }
    this.permissions = [];
    Object.values(this.permissionStore.get())?.forEach(p => this.permissions.push(p?.code));

    this.displayMode =(dossier.codeStatus?.includes(Status.DECISION) ||  
    dossier.codeStatus?.includes(Status.NOTIFICATION_GENERATED) ) && 
    !dossier.codeStatus.includes(Status.ADDITIONAL_AGENCY_INFORMATION) ? 2 : 1;
  }

  private prepareDialogData(): any {
    const dossier = this.dossierStore.get();
    const loanData: LoanData = {...dossier.loanData};
    const insuranceData: InsuranceData = {...dossier.insuranceData};
    const product = {...dossier.product};
    const lastNotif = this.attachmentService.getLastUploadedFileByType(AttachmentType.Notification);
    let  warranties= dossier.warranties?.filter(({attachment}: any) => attachment?.uuid ===lastNotif?.uuid);
    if(this.dossierRequestInProgress){
      loanData.claimedAmountOfPurchase= this.dossierRequestInProgress?.claimedAmountOfPurchase;
      loanData.claimedAmountOfBuildDevelopment= this.dossierRequestInProgress?.claimedAmountOfBuildDevelopment;
      loanData.rateType= {code: this.dossierRequestInProgress?.typeRate!, designation: ""};
      loanData.rate= this.dossierRequestInProgress?.creditRate;
      loanData.deadlineNumber= this.dossierRequestInProgress?.deadlineNumber;
      loanData.cappedRate= this.dossierRequestInProgress?.cappedRate;
      loanData.applicationFee= this.dossierRequestInProgress?.applicationFee
      loanData.delayed=  this.dossierRequestInProgress?.delayed;
      loanData.delayType= {code: this.dossierRequestInProgress?.delayType!, designation: ""};
      loanData.delayDuration= this.dossierRequestInProgress?.delayDuration;
      insuranceData.insuredPercentage= this.dossierRequestInProgress?.insuredPercentage!;
      insuranceData.insuranceCoefficient=  this.dossierRequestInProgress?.insuranceCoefficient!;
      insuranceData.subsidizedInsuredPercentage= this.dossierRequestInProgress?.subsidizedInsuredPercentage!;
      insuranceData.subsidizedPromotionalInsuranceRate= this.dossierRequestInProgress?.subsidizedPromotionalInsuranceRate!;
      insuranceData.subsidizedInsuranceCoefficient= this.dossierRequestInProgress?.subsidizedInsuranceCoefficient!;
      insuranceData.bonusInsuredPercentage= this.dossierRequestInProgress?.bonusInsuredPercentage!;
      insuranceData.bonusPromotionalInsuranceRate= this.dossierRequestInProgress?.bonusPromotionalInsuranceRate!;
      insuranceData.bonusInsuranceCoefficient= this.dossierRequestInProgress?.bonusInsuranceCoefficient!;
      insuranceData.suportedInsuredPercentage= this.dossierRequestInProgress?.suportedInsuredPercentage!;
      insuranceData.suportedPromotionalInsuranceRate= this.dossierRequestInProgress?.suportedPromotionalInsuranceRate!;
      insuranceData.suportedInsuranceCoefficient= this.dossierRequestInProgress?.suportedInsuranceCoefficient!;

      insuranceData.typeAInsuredPercentage= this.dossierRequestInProgress?.typeAInsuredPercentage!;
      insuranceData.typeAInsuranceCoefficient=  this.dossierRequestInProgress?.typeAInsuranceCoefficient!;
      insuranceData.typeBInsuredPercentage= this.dossierRequestInProgress?.typeBInsuredPercentage!;
      insuranceData.typeBInsuranceCoefficient=  this.dossierRequestInProgress?.typeBInsuranceCoefficient!;
      insuranceData.aditionalCreditInsuredPercentage= this.dossierRequestInProgress?.aditionalCreditInsuredPercentage!;
      insuranceData.aditionalCreditInsuranceCoefficient=  this.dossierRequestInProgress?.aditionalCreditInsuranceCoefficient!;
      warranties=this.dossierRequestInProgress?.requestWarranties
    }

    return { loanData, insuranceData,product, warranties };
  }
  
  rules: any = {
    isAssignedToMe: (d: DossierData) => d.assignedToMe,
    isAllAttachmentsControlled: () => this.isAllAttachmentControlled === true,
    isAllAttachmentsConform: () => this.isAllAttachmentControlledOK === true,
    hasAllMandatoryAttachments: () => this.dossierDataService.hasAllMandatoryAttachments === true,
    hasNotAllMandatoryAttachments: () => this.dossierDataService.hasAllMandatoryAttachments === false,
    isStatus: (statuses: string[]) => (d: any) => statuses.includes(d.codeStatus),
    isTaskStatus: (tasks: string[]) => (d: any) => tasks.includes(d.taskStatus),
    hasRole: (roles: string[]) => this.userService.hasRole(roles),
    haRequestInProgress: () => this.dossierRequestInProgress?.requestStatus === RequestStatus.IN_PROGRESS,
    currentUserIs: (professions: string[]) => () => professions.includes(this.userService.currentUserCodeProfession),
    isDecisionRetryConsumed: (d: DossierData) => !d.returnDecisionInstance
  };

  combineRules = {
    and: (...rules: Array<(d: DossierData) => boolean>) =>
      (d: DossierData) => rules.every(rule => rule(d)),

    or: (...rules: Array<(d: DossierData) => boolean>) =>
      (d: DossierData) => rules.some(rule => rule(d))
  };

  handlers = [
    {
      labelKey: "button.requestMoreInfo.label",
      icon: "assets/svg/risktransfert.svg",
      class: "action-btn",
      permissions: [
        Permissions.ROLE_PP_REQUEST_ADD_INFOS_VALIDATOR,
        Permissions.ROLE_PP_REQUEST_ADD_INFOS_DECISION,
        Permissions.ROLE_PP_REQUEST_ADD_INFOS_RISK,
        Permissions.ROLE_PP_REQUEST_ADD_INFOS_CTB_EXPASS,
        Permissions.ANALYSIS_RETAIL_MORE_INFOS,
        Permissions.ROLE_PP_REQUEST_ADD_INFOS_CTB
      ],
      visibilityIf: this.combineRules.or(
        this.rules.isTaskStatus([Status.REXP, Status.REXPR,Status.INCA_EXP,Status.INCA_EXPS]),
        this.rules.isStatus(REQUEST_MORE_INFO_STATUS),
      ),
      disabledIf: this.combineRules.or(
        (d) => this.rules.hasAllMandatoryAttachments(d) && this.rules.isStatus([Status.A_TRAITER_DSC_CTB])(d),
        (d) => this.rules.hasNotAllMandatoryAttachments(d) && this.rules.isTaskStatus([Status.REXP, Status.REXPR])(d),
        () => !this.rules.isAllAttachmentsControlled(),
      ),
      click: (d: DossierData) => this.onRequestMoreInfo(d)
    },
    {
      labelKey: "button.sendDossier.label",
      icon: "assets/svg/risktransfert.svg",
      class: "action-btn",
      permissions: [Permissions.ROLE_PP_RETURN_ADD_INFOS],
      visibilityIf: this.combineRules.or(
        this.rules.isTaskStatus([Status.INCA_EXP, Status.INCA_EXPS]),
        this.rules.isStatus(RESPONSE_MORE_INFO_STATUS)
      ),
      disabledIf: () => !this.rules.isAllAttachmentsControlled(),
      click: () => this.onResponseMoreInfo(),
    },
    {
      labelKey: "button.editDossier.label",
      icon: "assets/svg/risktransfert.svg",
      class: "action-btn",
      permissions: [Permissions.ROLE_PP_UPDATE_DOSSIER],
      visibilityIf: this.rules.isStatus([
        Status.INITIATION, 
        Status.ADDITIONAL_AGENCY_INFORMATION_VALIDATION, 
        Status.ADDITIONAL_AGENCY_INFORMATION_DECISION,
        Status.INCA_AANR, Status.INCA_AVRS_RANR, 
        Status.INFO_COMP_AGREEMENT_RISK, 
        Status.INFO_COMP_DECISION_RS
      ]),
      disabledIf: () => false,
      click: () => this.onEditDossier()
    },
    {
      labelKey: "button.validDossier.label",      
      permissions: [Permissions.ROLE_PP_ACCORD_DOSSIER],
      class: "action-btn",
      icon: "assets/svg/valid.svg",
      visibilityIf: this.rules.isStatus([
        Status.DECS_RIDN,  
        Status.AVRS_RIDN, 
        Status.AVRS_ANR_RIDN ,
        Status.DECISION, 
        Status.AGREEMENT_RISK, 
        Status.DECISION_RS, 
        Status.AGREEMENT_RISK_ANALIST_RETAIL, 
        Status.DECS_RS_RIND, 
        Status.DECS_RS_FINAL_RIND
      ]),
      disabledIf: () => false,
      click: () => this.onGrantLoan()
    },
    {
      labelKey: "button.rejectDossier.label",
      permissions: [Permissions.ROLE_PP_REJECT_DOSSIER],
      class: "action-btn",
      icon: "assets/svg/reject.svg",
      visibilityIf: this.rules.isStatus([Status.DECISION, Status.DECISION_RS, Status.AGREEMENT_RISK, Status.AGREEMENT_RISK_ANALIST_RETAIL]),
      disabledIf: () => false,
      click: () => this.onRejectDialog()
    },
    {
      labelKey: "button.revoirProposition.label",
      permissions: [Permissions.ROLE_PP_REVIEW_REQUEST],
      class: "action-btn",
      icon: "assets/svg/revoirProposition.svg",
      visibilityIf:  this.combineRules.and(
        this.rules.isStatus([Status.DECS_RIDN , Status.AVRS_RIDN, Status.AVRS_ANR_RIDN,  Status.DECS_RS_RIND, Status.DECS_RS_FINAL_RIND]),
        this.rules.haRequestInProgress
      ),
      disabledIf: () => false,
      click: (dossier: DossierData) => this.onRequestMoreInfo(dossier)
    },
    {
      labelKey: "button.sendDossier.label",
      permissions: [Permissions.ROLE_PP_ACCORD_DOSSIER],
      class: "action-btn",
      icon: "assets/svg/sendDossier.svg",
      visibilityIf: this.rules.isStatus([
        Status.NOTIFICATION_GENERATED, 
        Status.NOTIFICATION_GENERATED_RISK,
        Status.NOTIFICATION_GENERATED_RIDN,
        Status.NOTIF_AVRS_RIDN, 
        Status.NOTIF_AVRS, 
        Status.NOTIF_AVRS_ANR
      ]),
      disabledIf: () => false,
      click: () => this.onSendDossier()
    },
    {
      labelKey: "button.risktransfert.label",
      permissions: [Permissions.ROLE_PP_TRANSFER_TO_RISK],
      class: "action-btn",
      icon: "assets/svg/risktransfert.svg",
      visibilityIf: this.combineRules.and(
        this.rules.isStatus([Status.DECISION, Status.AGREEMENT_RISK, Status.AGREEMENT_RISK_ANALIST_RETAIL, Status.AVRS_RIDN, Status.DECS_RIDN,Status.AVRS_ANR_RIDN]),
        () => !this.rules.currentUserIs(["DA","DCL"])()
      ),
      disabledIf: () => false,
      click: () => this.onTransfertRiskDialog()
    },
    {
      labelKey: "button.agreementrequest.label",
      permissions: [Permissions.ROLE_PP_REQUEST_RISK_AGREEMENT],
      class: "action-btn",
      icon: "assets/svg/agreementrequest.svg",
      visibilityIf: this.combineRules.or(
        this.rules.isStatus([Status.DECISION, Status.AGREEMENT_RISK_ANALIST_RETAIL, Status.DECS_RIDN, Status.AVRS_RIDN,Status.AVRS_ANR_RIDN]),
        (d) => this.rules.isStatus([Status.AGREEMENT_RISK])(d) && this.rules.currentUserIs(["DRPP"])()
      ),
      disabledIf: () => false,
      click: () => this.onAgreementRequestDialog()
    },
    {
      labelKey: "button.agreementRisk.label",
      permissions: [Permissions.ROLE_PP_TRANSFER_TO_RESP_RISK],
      class: "action-btn",
      icon: "assets/svg/agreementrequest.svg",
      visibilityIf: this.rules.isStatus([Status.DECISION_RS]),
      disabledIf: () => false,
      click: () => this.onTransferRespRiskDialog()
    },
    {
      labelKey: "button.agreementRisk.label",
      permissions: [Permissions.ROLE_PP_TRANSFER_TO_RESP_RISK],
      class: "action-btn",
      icon: "assets/svg/agreementrequest.svg",
      visibilityIf: this.rules.isStatus([Status.DECS_RS_RIND]),
      disabledIf: () => false,
      click: () => this.onTransfertRiskDialog()
    },
    {
      labelKey: "button.RevoirGarantiesReserves.label",
      permissions: [Permissions.ROLE_PP_UPDATE_DOSSIER],
      class: "action-btn",
      icon: "assets/svg/agreementrequest.svg",
      visibilityIf: this.combineRules.and(
        this.rules.isStatus([Status.DECISION_RS, Status.DECS_RIDN, Status.AVRS_RIDN,Status.AVRS_ANR_RIDN]),
        this.rules.hasRole([Role.ANALYSIS_RISK])
      ),
      disabledIf: () => false,
      click: (dossier: DossierData) => this.updateWarranties(dossier)
    },
    {
      labelKey: "button.sendDossier.label",
      permissions: [Permissions.ROLE_PP_TRANSFER_TO_DECISION_AUTHORITY],
      class: "action-btn",
      icon: "assets/svg/agreementrequest.svg",
      visibilityIf: this.rules.isStatus([Status.COMPLIANCE_CONTROL]),
      disabledIf: () => !this.rules.isAllAttachmentsConform(),
      click: () => this.onSendDossierToDecisionAuthority()
    },
    {
      labelKey: "button.sendDossier.label",
      permissions: [Permissions.ROLE_PP_RETURN_ADD_INFOS],
      class: "action-btn",
      icon: "assets/svg/agreementrequest.svg",
      visibilityIf: this.combineRules.or(
        this.rules.isStatus([
          Status.ADDITIONAL_AGENCY_INFORMATION_VALIDATION, 
          Status.ADDITIONAL_AGENCY_INFORMATION_DECISION, 
          Status.INCA_RIDN, 
          Status.INFO_COMP_AGREEMENT_RISK, 
          Status.INFO_COMP_DECISION_RS, 
          Status.DECS_ANR_INCA_RIDN, 
          Status.AVRS_INCA_RIDN, 
          Status.AVRS_ANR_INCA_RIDN, 
          Status.DECS_RS_INCA_RIDN, 
          Status.DECS_RS_FINAL_RIND,
          Status.DECS_RS_FINAL_INCA_RIDN
        ]),
        this.rules.isTaskStatus([Status.INCA_EXP, Status.INCA_EXPS])
      ),
      disabledIf: this.rules.hasAllMandatoryAttachments,
      click: () => this.onResponseMoreInfo()
    },
    {
      labelKey: "button.returnToDecision.label",
      permissions: [Permissions.ROLE_PP_RETURN_TO_DECISION],
      class: "action-btn",
      icon: "assets/svg/agreementrequest.svg",
      visibilityIf: this.rules.isStatus([Status.DOSSIER_APPROUVED, Status.INCA_GEN, Status.DOSSIER_AVIS_RISK_APPROUVED, Status.DOSSIER_APPROUVED_RISK, Status.OPC_REMISE_AU_CLIENT]),
      disabledIf: this.combineRules.or(
        this.rules.isDecisionRetryConsumed,
        (d) => this.rules.hasNotAllMandatoryAttachments(d) && this.rules.isStatus([Status.OPC_REMISE_AU_CLIENT])(d)
      ),
      click: () => this.onSendBackToDecision()
    },
    {
      labelKey: "button.editRequest.label",
      permissions: [Permissions.ROLE_PP_RETURN_TO_DECISION],
      class: "action-btn",
      icon: "assets/svg/agreementrequest.svg",
      visibilityIf: this.rules.isStatus([
        Status.INCA_RIDN, 
        Status.DECS_ANR_INCA_RIDN, 
        Status.AVRS_INCA_RIDN, 
        Status.AVRS_ANR_INCA_RIDN,  
        Status.DECS_RS_INCA_RIDN, 
        Status.DECS_RS_FINAL_RIND, 
        Status.DECS_RS_FINAL_INCA_RIDN
      ]),
      disabledIf: this.combineRules.or(
        this.rules.isDecisionRetryConsumed,
        (d) => this.rules.hasNotAllMandatoryAttachments(d) && this.rules.isStatus([Status.OPC_REMISE_AU_CLIENT])(d)
      ),
      click: () => this.onSendBackToDecision()
    },
    {
      labelKey: "button.forwardEditer.label",
      permissions: [Permissions.ROLE_PP_RETURN_TO_DECISION],
      class: "action-btn",
      icon: "assets/svg/agreementrequest.svg",
      visibilityIf: (d: DossierData) => this.rules.isStatus([Status.DOSSIER_APPROUVED]) && d.accord === AccordType.PRINCIPE,
      disabledIf: this.combineRules.or(this.rules.isDecisionRetryConsumed, this.rules.hasNotAllMandatoryAttachments),
      click: () => this.onSendAccordToDecision()
    },
    {
      labelKey: "button.duplicate.label",
      permissions: [Permissions.ROLE_PP_RETURN_TO_DECISION],
      class: "action-btn",
      icon: "assets/svg/agreementrequest.svg",
      visibilityIf: this.combineRules.and(this.rules.isStatus([Status.DOSSIER_APPROUVED]), () => this.isProspect),
      disabledIf: () => false,
      click: () => this.onDupliquerDossier()
    },
    {
      labelKey: "button.forwardToDSC.label",
      permissions: [Permissions.ROLE_PP_FORWARD_TO_DSC],
      class: "action-btn",
      icon: "assets/svg/agreementrequest.svg",
      visibilityIf: this.combineRules.and(this.rules.isStatus([Status.DOSSIER_APPROUVED]), (d: DossierData) => d.accord === AccordType.DEFINITIF),
      disabledIf: this.rules.hasNotAllMandatoryAttachments,
      click: () => this.onForwardToDSC()
    },
    {
      labelKey: "button.assignToCTB.label",
      permissions: [Permissions.ROLE_PP_REASSIGN_DOSSIER],
      class: "action-btn",
      icon: "assets/svg/agreementrequest.svg",
      visibilityIf: (d: DossierData) => this.rules.isStatus([Status.A_TRAITER_DSC])(d) && d.codeStatus === d.taskStatus,
      disabledIf: () => false,
      click: (d: DossierData) => this.onAffectToCTB(d)
    },
    {
      labelKey: "button.transfer.to.supervisor.label",
      permissions: [Permissions.ROLE_PP_REQUEST_OPC_VALIDATION],
      class: "action-btn",
      icon: "assets/svg/agreementrequest.svg",
      visibilityIf: this.rules.isStatus([Status.INCD_GEN, Status.A_TRAITER_DSC_CTB,Status.OPCAM_GEN]),
      disabledIf: this.combineRules.or(() => !this.rules.isAllAttachmentsConform(), this.rules.hasNotAllMandatoryAttachments),
      click: () => this.sendOPCToSupervisor()
    },
    {
      labelKey: "button.forwardToCtb.label",
      permissions: [Permissions.ROLE_PP_RETURN_ADD_INFOS],
      class: "action-btn",
      icon: "assets/svg/agreementrequest.svg",
      visibilityIf: this.rules.isStatus([Status.INCA_GEN]),
      disabledIf: () => false,
      click: () => this.onForwardToCTB()
    },
    {
      labelKey: "button.opcNonValid.label",
      permissions: [Permissions.ROLE_PP_RETURN_OPC_COMPLETION],
      class: "action-btn",
      icon: "assets/svg/agreementrequest.svg",
      visibilityIf: (d: DossierData) => this.rules.isStatus([Status.OPCA])(d) && d.codeStatus === d.taskStatus,
      disabledIf: () => false,
      click: () => this.onReturnToCTBForUpdate()
    },
    {
      labelKey: "button.opcValid.label",
      permissions: [Permissions.ROLE_PP_TRANSFER_OPC_INITIATOR],
      class: "action-btn",
      icon: "assets/svg/agreementrequest.svg",
      visibilityIf: (d: DossierData) => this.rules.isStatus([Status.OPCA])(d) && d.codeStatus === d.taskStatus,
      disabledIf: this.rules.hasNotAllMandatoryAttachments,
      click: () => this.validateOPC()
    },
    {
      labelKey: "button.modification.OPC.label",
      permissions: [Permissions.ROLE_PP_RETURN_OPC_COMPLETION],
      class: "action-btn",
      icon: "assets/svg/agreementrequest.svg",
      visibilityIf: this.rules.isStatus([Status.OPC_VALIDATED]),
      disabledIf: () => false,
      click: () => this.onReturnToCTBForUpdate()
    },
    {
      labelKey: "button.remise.OPC.label",
      permissions: [Permissions.ROLE_PP_DELIVER_OPC],
      class: "action-btn",
      icon: "assets/svg/agreementrequest.svg",
      visibilityIf: this.rules.isStatus([Status.OPC_VALIDATED]),
      disabledIf: () => false,
      click: () => this.onChangeOpcDates()
    },
    {
      labelKey: "button.dossier.transferToClient",
      permissions: [Permissions.ROLE_PP_CONTROL_PHYSICAL_DOSSIER],
      class: "action-btn",
      icon: "assets/svg/agreementrequest.svg",
      visibilityIf: this.rules.isStatus([Status.OPC_SIGNE, Status.OPC_WAITING_EXPERTISE]),
      disabledIf: this.combineRules.or(this.rules.isStatus([Status.OPC_WAITING_EXPERTISE]), this.rules.hasNotAllMandatoryAttachments),
      click: () => this.onPhysicalTransferToClient()
    },
    {
      labelKey: "receipt.OPC.label",
      permissions: [Permissions.ROLE_PP_RECEIVE_SIGNED_OPC],
      class: "action-btn",
      icon: "assets/svg/agreementrequest.svg",
      visibilityIf: this.rules.isStatus([Status.OPC_REMISE_AU_CLIENT]),
      disabledIf: this.rules.hasNotAllMandatoryAttachments,
      click: () => this.onChangeOpcDates()
    },
    {
      labelKey: "button.transfer.control.warranties.label",
      permissions: [Permissions.ROLE_PP_TRANSFER_CONTROL_WARRANTIES],
      class: "action-btn",
      icon: "assets/svg/agreementrequest.svg",
      visibilityIf: this.rules.isStatus([Status.A_TRAITER_DSC_MIS,Status.CONTROLE_MIN_ENG,Status.INCD_MIS]),
      disabledIf: this.combineRules.or(() => !this.rules.isAllAttachmentsConform(), this.rules.hasNotAllMandatoryAttachments),
      click: () => this.sendToControlWarranties()
    },
    {
      labelKey: "button.transfer.notary.relationship.label",
      permissions: [Permissions.ROLE_PP_TRANSFER_NOTARY_RELATIONSHIP],
      class: "action-btn",
      icon: "assets/svg/agreementrequest.svg",
      visibilityIf: this.rules.isStatus([Status.A_TRAITER_DSC_MIS,Status.CONTROLE_MIN_ENG,Status.INCD_MIS]),
      disabledIf: () => false,
      click: () => this.sendToNotaryRelationship()
    },
    {
      labelKey: "button.forwardToCtb.label",
      permissions: [Permissions.ROLE_PP_TRANSFER_MINUTE_CHECK],
      class: "action-btn",
      icon: "assets/svg/agreementrequest.svg",
      visibilityIf: this.rules.isStatus([Status.ATTENTE_RETOUR_NOTAIRE]),
      disabledIf: this.rules.hasNotAllMandatoryAttachments,
      click: () => this.notaryMinutesRequest()
    },
    {
      labelKey: "button.request.documents.label",
      permissions: [Permissions.ROLE_PP_REQUEST_MINUTE],
      class: "action-btn",
      icon: "assets/svg/agreementrequest.svg",
      visibilityIf: this.rules.isStatus([Status.TRAITER_RELATION_NOTAIRE]),
      disabledIf: () => false,
      click: () => this.onRequestDocuments()
    },
    {
      labelKey: "button.requestMoreInfoForWarranties.label",
      permissions: [Permissions.ROLE_PP_REQUEST_DOSSIER_COMPLETION],
      class: "action-btn",
      icon: "assets/svg/agreementrequest.svg",
      visibilityIf: this.rules.isStatus([Status.CONTROLE_GARANTIE]),
      disabledIf: () => false,
      click: () => this.onRejectWarranties()
    },
    {
      labelKey: "button.validateWarranties.label",
      permissions: [Permissions.ROLE_PP_VALIDATE_BEFORE_RELEASE],
      class: "action-btn",
      icon: "assets/svg/agreementrequest.svg",
      visibilityIf: this.rules.isStatus([Status.CONTROLE_GARANTIE]),
      disabledIf: this.rules.hasNotAllMandatoryAttachments,
      click: () => this.onForwardToSupervisor()
    },
    {
      labelKey: "button.returnDossier.label",
      permissions: [Permissions.ROLE_PP_REQUEST_DOSSIER_COMPLETION],
      class: "action-btn",
      icon: "assets/svg/agreementrequest.svg",
      visibilityIf: this.rules.isStatus([Status.TO_VALIDATE]),
      disabledIf: () => false,
      click: () => this.returnDossier()
    },
    {
      labelKey: "button.validateDossier.label",
      permissions: [Permissions.ROLE_PP_TRANSFER_FOR_RELEASE],
      class: "action-btn",
      icon: "assets/svg/agreementrequest.svg",
      visibilityIf: this.rules.isStatus([Status.TO_VALIDATE]),
      disabledIf: () => false,
      click: () => this.validateDossier()
    },
    {
      labelKey: "button.sendDossier.label",
      permissions: [Permissions.ROLE_PP_RETURN_ADD_INFOS],
      class: "action-btn",
      icon: "assets/svg/agreementrequest.svg",
      visibilityIf: this.rules.isStatus([Status.TO_VALIDATE]),
      disabledIf: () => !this.rules.isAllAttachmentsConform(),
      click: () => this.additionalInfoCTBToSupervisor()
    },
    {
      labelKey: "button.release.label",
      permissions: [Permissions.ROLE_PP_RELEASE],
      class: "action-btn",
      icon: "assets/svg/agreementrequest.svg",
      visibilityIf: this.rules.isStatus([Status.ADEB, Status.DEBP]),
      disabledIf: () => false,
      click: () => this.onRelease()
    },
    {
      labelKey: "button.partial.release.label",
      permissions: [Permissions.ROLE_PP_RELEASE],
      class: "action-btn",
      icon: "assets/svg/agreementrequest.svg",
      visibilityIf: this.rules.isStatus([Status.DEM_DEBP]),
      disabledIf: () => false,
      click: () => this.onRelease()
    },
    {
      labelKey: "button.receivePhysicalFile.label",
      permissions: [Permissions.ROLE_PP_RECEIVE_PHYSICAL_FILE],
      class: "action-btn",
      icon: "assets/svg/agreementrequest.svg",
      visibilityIf: this.rules.isStatus([Status.ATDP]),
      disabledIf: () => false,
      click: () => this.receivePhysicalFile()
    },
    {
      labelKey: "button.RevoirGarantiesReserves.label",
      permissions: [Permissions.ROLE_PP_UPDATE_DOSSIER],
      class: "action-btn",
      icon: "assets/svg/agreementrequest.svg",
      visibilityIf: this.rules.isStatus([Status.AANR, Status.DECS_ANR_RIDN, Status.AVRS_ANR_INCANR_RIDN,Status.INFO_COMP_RETOUR_ANALIST_RETAIL]),
      disabledIf: () => false,
      click: (d: DossierData) => this.updateWarranties(d)
    },
    {
      labelKey: "button.sendDossier.label",
      permissions: [Permissions.ROLE_PP_TRANSFER_TO_FEEDEBACK_DRPP_DR],
      class: "action-btn",
      icon: "assets/svg/agreementrequest.svg",
      visibilityIf: this.rules.isStatus([Status.AANR, Status.DECS_ANR_RIDN, Status.AVRS_ANR_INCANR_RIDN,Status.INFO_COMP_RETOUR_ANALIST_RETAIL]),
      disabledIf: () => false,
      click: () => this.onTransferToDrDRPP()
    },
    {
      labelKey: "button.sendDossier.label",
      permissions: [Permissions.ROLE_PP_TRANSFER_TO_FEEDEBACK_DRPP_DR],
      class: "action-btn",
      icon: "assets/svg/agreementrequest.svg",
      visibilityIf: this.rules.isTaskStatus([Status.REXP, Status.EXPS]),
      disabledIf: this.rules.hasNotAllMandatoryAttachments,
      click: (d:DossierData) => this.onRespenseExpertise(d.taskStatus)
    },
    {
      labelKey: "button.validateDossier.label",
      permissions: [Permissions.ROLE_PP_TRANSFER_TO_FEEDEBACK_DRPP_DR],
      class: "action-btn",
      icon: "assets/svg/agreementrequest.svg",
      visibilityIf: this.rules.isTaskStatus([Status.REXPR]),
      disabledIf: this.rules.hasNotAllMandatoryAttachments,
      click: (d:DossierData) => this.onRespenseExpertise(d.taskStatus)
    },
    {
      labelKey: "button.takeCharge.label",
      permissions: [],
      class: "action-btn",
      icon: "assets/svg/agreementrequest.svg",
      visibilityIf: (d: DossierData) => d.poolCandidate && !d?.assignedToMe,
      disabledIf: () => false,
      click: () => this.assignToMe()
    },
    {
      labelKey: "button.assignToCTB.label",
      permissions: [],
      class: "action-btn",
      icon: "assets/svg/agreementrequest.svg",
      visibilityIf: this.combineRules.and(
        (d: DossierData) => !d.assignee,
        this.rules.hasRole([Role.ASSING_POOL_SUPERVISORS]),
        this.rules.isStatus([Status.OPCA])
      ),
      disabledIf: () => false,
      click: (d:DossierData) => this.onAffectToCTB(d)
    },
    {
      labelKey: "button.agreementRisk.label",
      permissions: [Permissions.ROLE_PP_TRANSFER_TO_RESP_RISK],
      class: "action-btn",
      icon: "assets/svg/agreementrequest.svg",
      visibilityIf: this.combineRules.and(
        this.rules.isStatus([Status.DECISION_RS]) ,
        (d: DossierData) => !d.assignedToMe && !d.poolCandidate,
        this.rules.currentUserIs(['ARR','ROR','RORE','DRR'])
      ),
      disabledIf: () => false,
      click: () => this.onTransferRespRiskDialog()
    },
    {
      labelKey: "button.reaffect.label",
      permissions: [Permissions.ROLE_PP_REASSIGN_DOSSIER],
      class: "action-btn",
      icon: "assets/svg/agreementrequest.svg",
      visibilityIf: (d: DossierData) => this.showReassignMenuTrigger(d)  && !d?.assignedToMe,
      disabledIf: () => false,
      click: (d:DossierData) => this.showAffectDialog(d)
    },
  ]
}
