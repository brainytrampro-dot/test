import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Injector,
  OnInit,
  Pipe,
  PipeTransform} from '@angular/core';
import { BaseComponent, CommentDialogComponent } from '@shared/components';
import { AmountFormatPipe, PermissionManagerService } from '@octroi-credit-common';
import { Permissions, Role } from '@core/constants';
import { DossierDataService } from '@core/services';
import { StatisticService } from '@statistics/services';
import { DossierData } from '@core/models';
import { DatePipe, UpperCasePipe } from '@angular/common';
import { BehaviorSubject, Observable, take } from 'rxjs';
import { UserService } from '@core/services/user.service';
import { ReassignUserDialogComponent } from '../reassign-user-dialog/reassign-user-dialog.component';
import { Stage, Status } from '@loan-dossier/constants';
import { AssignUserDialogComponent } from '../assign-user-dialog/assign-user-dialog.component';
import { ReassignRequestViewDialogComponent } from '../reassign-request-view-dialog/reassign-request-view-dialog.component';
import { UserrSearchCriteria } from '@core/models/UserrSearchCriteria.model';
import { TransmettreDialogComponent } from '../transmettre-dialog/transmettre-dialog.component';
import { environment } from '@env/environment';

enum DossierTabs {
  ALL_INPROGRESS_TASKS= "ALL_INPROGRESS_TASKS",
  ALL_DOSSIERS= "ALL_DOSSIERS",
  ALL_DOSSIERS_FRONT= "ALL_DOSSIERS_FRONT",
  ALL_DOSSIERS_BACK= "ALL_DOSSIERS_BACK",
  ALL_RETURNED_TASKS= "ALL_RETURNED_TASKS",
  ALL_DOSSIERS_FRONT_HAS_REQUEST = "ALL_DOSSIERS_FRONT_HAS_REQUEST",
  ALL_DOSSIERS_IN_POOL= "ALL_DOSSIERS_IN_POOL",
  ALL_RELEASED_DOSSIERS="ALL_RELEASED_DOSSIERS"
}
@Component({
  selector: 'app-homepage',
  templateUrl: './homepage.component.html',
  styleUrls: ['./homepage.component.scss'],
  providers: [AmountFormatPipe, DatePipe]
})
export class HomePageComponent extends BaseComponent implements OnInit {
  permissionContants = Permissions;
  permissions: string[] = [];
  dossiers: {result: DossierData[], totalElements: number } = {result:[], totalElements: 0};
  itemsPerPage = 8;
  isClientSearchOpened: boolean=false;
  activeTab: DossierTabs = DossierTabs.ALL_DOSSIERS;
  selectedIndex: number = 0;
  counts = { DSC: 0, RESEAU: 0, ATTENTE_CLIENT: 0, countUnBlocked: 0, countReturnedMis: 0, countReturnedOPC: 0, countReturnedApproved:0 };
  selectedTabs: DossierTabs[] = [];
  rsikProfessions: string[] = ['ARR','ROR','RORE','DRR'];
  isRiskProfession!: boolean;
  resetTabEvent = new EventEmitter<void>();
  isProspectSearchOpened: boolean=false;
  env = environment;
  drppHeaderLabel: string = 'dossier.drpp.code.label';
  tabMap: DossierTabs[] = [
    DossierTabs.ALL_INPROGRESS_TASKS,
    DossierTabs.ALL_DOSSIERS,
    DossierTabs.ALL_DOSSIERS_FRONT,
    DossierTabs.ALL_DOSSIERS_FRONT_HAS_REQUEST,
    DossierTabs.ALL_DOSSIERS_BACK,
    DossierTabs.ALL_RETURNED_TASKS,
    DossierTabs.ALL_DOSSIERS_IN_POOL,
    DossierTabs.ALL_RELEASED_DOSSIERS
  ];
  columns: any[] = [
    {
      class: "etat-col",
      visibility: () => true,
      render: (row: any) => {
        const amount = row?.loanAmount ?? 0;
        const isPatrimonial = !!row?.market?.includes('09');
        const isBlueCardHolder = !!row?.customerBlueCardHolder;
        const segment = row?.segment ?? "";
        const marketShorthand = row?.marketShorthand ?? "";

        if (isPatrimonial) {
          return `<img src="assets/svg/path.svg" width="35" alt="pat-icon">`;
        }

        if (isBlueCardHolder) {
          return `<img src="assets/img/blueCard.png" width="35" alt="blue-card-icon">`;
        }

        const isVipByAmount = amount >= 1500000 && !isPatrimonial;
        const isVipByRetailSegment = (marketShorthand === 'CLIPRI' || marketShorthand === 'CLIPRO') && (segment && segment.toLowerCase().includes('haut de gamme'));

       if (isVipByAmount || isVipByRetailSegment) {
             return `<img src="assets/img/vip.png" width="35" alt="vip-icon">`;}


        return null;
      }
    },
    {field: 'createdAt', label: 'dossier.date.creation.label', pipe: this.dateFormat},
    {field: 'numeroDossier', label: 'dossier.code.label'},
    {field: 'customerCode', label: 'dossier.customer.code.label'},
    {field: 'clientFullname', label: 'dossier.customer.name.label', pipe: this.upperCase},
    {field: 'drppDesignation', labelclass: 'text-uppercase', label: (row :any) => row?.market?.includes("09")? 'dossier.dra.code.label' : 'dossier.drpp.code.label', pipe: this.upperCase },
    {field: 'ucCode', labelclass: "text-uppercase", label: 'dossier.uc.code.label', pipe: this.upperCase, render: (row: any) => {  if (!row.ucCode || row.market?.includes("09")) { return 'N/A';  } return row.ucCode}},
    {field: 'branchCode', label: 'dossier.branch.code.label'},
    {field: 'stage', label: 'dossier.stage.label'},
    {field: 'designation', label: 'dossier.status.label'},
    {field: 'assignee', label: 'dossier.assignedTo.label', pipe: this.upperCase},
    {field: 'designationProduct', label: 'dossier.loan.type.label', pipe: this.upperCase},
    {field: 'loanAmount', label: 'dossier.loanAmount.label', pipe: this.amountFormat},
    {field: 'updatedAt', label: 'dossier.updated.date.label', pipe: this.dateFormat},
  ];

  tabConfig: any = {
    [DossierTabs.ALL_INPROGRESS_TASKS]:
    {
      label: "dashboard.tasks.title",
      permissions: [Permissions.ROLE_PP_VIEW_TASKS],
      unauthorizedPermissions: [],
      search: true,
      paginationMode: 'client',
      service: (listType: string, params: any) => this.dossierDataService.searchDossiers(listType, params),
      params: { searchCriteria: {listType: DossierTabs.ALL_INPROGRESS_TASKS}},
      data: [],
      count: 0,
      actions: [],
      filterValue:''
    },
    [DossierTabs.ALL_DOSSIERS_IN_POOL]: {
      label: "dashboard.reassign.supervisors.title",
      permissions: [Permissions.ROLE_PP_VIEW_DOSSIER_POOL_SUPERVISORS],
      unauthorizedPermissions: [],
      search: true,
      paginationMode: 'client',
      service: (listType: string, params: any) => this.dossierDataService.searchDossiers(listType, params),
      params: { searchCriteria: {listType: DossierTabs.ALL_DOSSIERS_IN_POOL}},
      data: [],
      count: 0,
      actions: [],
      filterValue:''
    },
    [DossierTabs.ALL_DOSSIERS]: {
      label: "dashboard.suivi.title",
      permissions: [Permissions.ROLE_PP_VIEW_DOSSIER],
      unauthorizedPermissions: [Permissions.ROLE_PP_VIEW_DOSSIER_FRONT, Permissions.ROLE_PP_VIEW_DOSSIER_BACK],
      search: true,
      paginationMode: 'server',
      service: (listType: string, params: any) => this.dossierDataService.searchDossiers(listType, params),
      params: { searchCriteria: {listType: DossierTabs.ALL_DOSSIERS}, page: 1, itemsPerPage: this.itemsPerPage},
      data: [],
      count: 0,
      actions: [],
      filterValue:''
    },
    [DossierTabs.ALL_DOSSIERS_FRONT]: {
      label: "dashboard.suivi.title",
      permissions: [Permissions.ROLE_PP_VIEW_DOSSIER_FRONT],
      unauthorizedPermissions: [],
      search: true,
      paginationMode: 'server',
      service: (listType: string, params: any) => this.dossierDataService.searchDossiers(listType, params),
      params: { searchCriteria: {listType: DossierTabs.ALL_DOSSIERS_FRONT}, page: 1, itemsPerPage: this.itemsPerPage},
      data: [],
      count: 0,
      actions: [],
      filterValue:''
    },
    [DossierTabs.ALL_DOSSIERS_FRONT_HAS_REQUEST]: {
      label: "dashboard.reassignrequests.title",
      permissions: [Permissions.ROLE_PP_VIEW_DOSSIER_FRONT,Permissions.ROLE_PP_VIEW_DOSSIER_HAS_REASSIGN_REQUEST],
      unauthorizedPermissions: [],
      search: true,
      paginationMode: 'server',
      service: (listType: string, params: any) => this.dossierDataService.searchDossiers(listType, params),
      params: { searchCriteria: {listType: DossierTabs.ALL_DOSSIERS_FRONT_HAS_REQUEST}, page: 1, itemsPerPage: this.itemsPerPage},
      data: [],
      count: 0,
      actions: [],
      filterValue:''
    },
    [DossierTabs.ALL_DOSSIERS_BACK]: {
      label: "dashboard.suivi.title",
      permissions: [Permissions.ROLE_PP_VIEW_DOSSIER_BACK],
      unauthorizedPermissions: [],
      search: true,
      paginationMode: 'server',
      service: (listType: string, params: any) => this.dossierDataService.searchDossiers(listType, params),
      params: { searchCriteria: {listType: DossierTabs.ALL_DOSSIERS_BACK}, page: 1, itemsPerPage: this.itemsPerPage},
      data: [],
      count: 0,
      actions: [],
      filterValue:''
    },
    [DossierTabs.ALL_RETURNED_TASKS]: {
      label: "dashboard.returned.title",
      permissions: [Permissions.ROLE_PP_VIEW_TASKS],
      unauthorizedPermissions: [],
      search: true,
      paginationMode: 'client',
      service: (listType: string, params: any) => this.dossierDataService.searchDossiers(listType, params),
      params: { searchCriteria:{listType: DossierTabs.ALL_RETURNED_TASKS}},
      data: [],
      count: 0,
      actions: [],
      filterValue:''
    },
    [DossierTabs.ALL_RELEASED_DOSSIERS]: { 
      label: "dashboard.released.title",
      permissions: [Permissions.ROLE_PP_VIEW_DOSSIER,Permissions.ROLE_PP_VIEW_DOSSIER_BACK,Permissions.ROLE_PP_VIEW_DOSSIER_FRONT],
      unauthorizedPermissions: [],
      search: true,
      paginationMode: 'client',
      service: (listType: string, params: any) => this.dossierDataService.searchDossiers(listType, params),
      params: { searchCriteria: {listType: DossierTabs.ALL_RELEASED_DOSSIERS}},
      data: [],
      count: 0,
      actions: [],
      filterValue:''
    }
  }
  actions: any[] = [
    {
      label: "button.takeCharge.label",
      permissions: [Permissions.ROLE_PP_VIEW_TASKS],
      visibility: (dossier: any) => dossier.poolCandidate && !dossier.assignee,
      authorizedTabs: [DossierTabs.ALL_INPROGRESS_TASKS, DossierTabs.ALL_RETURNED_TASKS],
      handleClick: (dossier: any) => this.assignToMe(dossier.uuid),
      icon: "takecharge.svg"
    },
    {
      label: "button.abort.label",
      permissions: [Permissions.ROLE_PP_ABORT_DOSSIER],
      visibility: () => true,
      authorizedTabs: [DossierTabs.ALL_INPROGRESS_TASKS, DossierTabs.ALL_RETURNED_TASKS],
      handleClick: (dossier: any) => this.openAbortDialog(dossier.uuid),
      icon: "abondonner.svg"
    },
    {
      label: "button.affect.label",
      permissions: [Permissions.ROLE_PP_REASSIGN_DOSSIER],
      visibility: (dossier: any) =>  dossier.status === Status.A_TRAITER_DSC || (this.userService.hasRole([Role.ASSING_POOL_SUPERVISORS]) &&  [Status.OPCA, Status.TO_VALIDATE].includes(dossier.status) ),
      authorizedTabs: [DossierTabs.ALL_INPROGRESS_TASKS, DossierTabs.ALL_RETURNED_TASKS, DossierTabs.ALL_DOSSIERS, DossierTabs.ALL_DOSSIERS_IN_POOL],
      handleClick: (dossier: any) => this.openAssignDialog(dossier),
      icon: "showAffect.svg"
    },
    {
      label: "button.reaffect.label",
      permissions: [Permissions.ROLE_PP_REASSIGN_DOSSIER, Permissions.ROLE_PP_CREATE_REQUEST_REASSIGNMENT, Permissions.ROLE_PP_REASSIGN_DOSSIER_PAT],
      visibility: (dossier: any) =>  (!["ACR", "DRPP", "RD_FO"].includes(this.userService.currentUserCodeProfession)) || this.isDossierTTY(dossier),
      authorizedTabs: [DossierTabs.ALL_DOSSIERS, DossierTabs.ALL_DOSSIERS_BACK, DossierTabs.ALL_DOSSIERS_FRONT],
      handleClick: (dossier: any) => this.openReassignDialog(dossier),
      icon: "showAffect.svg"
    },
    {
      label: "button.validate.reassign.label",
      permissions: [Permissions.ROLE_PP_REASSIGN_DOSSIER],
      visibility: () => true,
      authorizedTabs: [DossierTabs.ALL_DOSSIERS_FRONT_HAS_REQUEST],
      handleClick: (dossier: any) => this.openReassignRequestDialog(dossier),
      icon: "showAffect.svg"
    },
    {
      label: "button.agreementRisk.label",
      permissions: [Permissions.ROLE_PP_TRANSFER_TO_RESP_RISK],
      visibility: (dossier: any) => dossier?.status === Status.DECISION_RS && this.isRiskProfession,
      authorizedTabs: [DossierTabs.ALL_DOSSIERS],
      handleClick: (dossier: any) => this.onTransferRespRiskDialog(dossier),
      icon: "showAffect.svg"
    },
    {
      label: "button.takeCharge.label",
      permissions: [Permissions.ROLE_PP_REASSIGN_DOSSIER_PAT],
      visibility: (dossier: any) => this.isDossierTTYHorsInit(dossier),
      authorizedTabs: [DossierTabs.ALL_DOSSIERS],
      handleClick: (dossier: any) => this.assignToMe(dossier.uuid),
      icon: "takecharge.svg"
    },
    {
      label: "button.takeCharge.label",
      permissions: [Permissions.ROLE_PP_VIEW_DOSSIER_POOL_SUPERVISORS],
      visibility: () =>  true,
      authorizedTabs: [DossierTabs.ALL_DOSSIERS_IN_POOL],
      handleClick: (dossier: any) => this.assignToMe(dossier.uuid),
      icon: "takecharge.svg"
    },
  ];

  constructor(
    injector: Injector,
    private permManager: PermissionManagerService,
    public dossierDataService: DossierDataService,
    private cdRef: ChangeDetectorRef,
    private statisticService: StatisticService,
    private amountFormat: AmountFormatPipe,
    private dateFormat: DatePipe,
    private userService: UserService,
    private upperCase: UpperCasePipe
  ) {
    super(injector);
    this.permissions = this.permManager.connectedUserPermissionsCodes;
    this.isRiskProfession = this.rsikProfessions.includes(userService.currentUserCodeProfession);
  }

  ngOnInit(): void {
    this.fetchStatistics();
    this.loadAllData();
    this.getAuthorizedTabs();
  }

  isDossierTTYHorsInit(dossier: any) {
    return dossier.stageCode?.includes(Stage.DECISION) || [Stage.VALIDATION].includes(dossier.stageCode);
  }

  isDossierTTY(dossier: any) {
    return dossier.stageCode?.includes(Stage.DECISION) || [Stage.VALIDATION,Stage.INSTRUCTION].includes(dossier.stageCode);
  }

  private getAuthorizedTabs(): void{
    this.selectedTabs = this.tabMap.filter((tab) => this.permManager.isGranted(this.tabConfig[tab]?.permissions) &&
    !this.permManager.isGranted(this.tabConfig[tab]?.unauthorizedPermissions));
    this.activeTab = this.selectedTabs[0];
  }

  private fetchStatistics(){
    if(this.permManager.isGranted([Permissions.ROLE_PP_VIEW_DOSSIER], this.permissions)){
    this.statisticService.getCountsByPhase({ marketCodes: this.userService.currentUserprofessionMarkets || []})
    .subscribe({
      next: data => {
        if(data?.success && data?.result){
          const result = data.result || [];
          const counts = result.reduce((acc:any, stat:any) => {
            if (stat?.phase) acc[stat.phase] = stat.count || 0;
            return acc;
          }, {} as Record<string, number>);
          this.counts = {...this.counts, ...counts};
          this.changeDetectorRef.detectChanges();
        }
      },
      error: (error) => {
        this.logService.error("Error fetching counts dossiers :",error);
      }
    })

    this.statisticService.countsPeriodicPhases({ "scope": "byProfession" })
    .subscribe({
      next: data => {
        this.counts = {...this.counts, ...data};
        this.changeDetectorRef.detectChanges();
      },
      error: (error) => {
        this.logService.error("Error fetching counts Periodic phases :",error);
      }
    })
  }
  }

  private loadAllData(): void{
    this.tabMap.forEach((tab) => this.tabConfig[tab].paginationMode === 'client' && this.fetchTabData(tab, {}));
  }

  onTabChange(index: number){
    this.activeTab = this.selectedTabs[index];
    this.fetchTabData(this.activeTab, {});
  };

  onSearch(event: any) {
    const keyword = (event.target as HTMLInputElement).value.trim().toLowerCase();
    const selectedTab = this.tabConfig[this.activeTab];

    if (selectedTab.paginationMode === 'client') {
      selectedTab.filterValue = keyword;

      if (!keyword) {
        selectedTab.displayData = null;
      } else {
        selectedTab.displayData = selectedTab.data.filter((item: any) => {
          return (
            (item.numeroDossier?.toLowerCase().includes(keyword)) ||
            (item.customerCode?.toLowerCase().includes(keyword)) ||
            (item.clientFullname?.toLowerCase().includes(keyword)) ||
            (item.branchCode?.toLowerCase().includes(keyword)) ||
            (item.designation?.toLowerCase().includes(keyword)) ||
            (item.assignee?.toLowerCase().includes(keyword)) ||
            (item.designationProduct?.toLowerCase().includes(keyword))
          );
        });
      }
      this.cdRef.detectChanges();

    } else {
      this.resetTab();
      this.fetchTabData(this.activeTab, {
        searchCriteria: {
          listType: this.activeTab,
          searchKeyword: keyword || null
        }
      });
    }
  }

  fetchTabData(tab: DossierTabs, params: any): void {
    const selectedTab = this.tabConfig[tab];
    if(this.permManager.isGranted(selectedTab.permissions)){
      this.tabConfig[tab] = {...selectedTab, params:{...selectedTab.params, ...params}};
      const method = selectedTab.service as (listType:string, params: any) => Observable<any>;

      method(tab, this.tabConfig[tab].params).subscribe({
        next: (response: any) => {
          this.tabConfig[tab].data = response.result || [];
          this.tabConfig[tab].count = response.totalElements || 0;
          this.tabConfig[tab].displayData = null;
          this.cdRef.detectChanges();
        },
        error: (err) => {
          this.logService.error("Error fetching data", err);
        }
      })
    }
  }

  private deepSearch(obj: any, keyword: string): boolean {
    if (!obj) return false;

    return Object.values(obj).some((val: any) => {
      if (val === null || val === undefined) {
        return false;
      }
      if (typeof val === 'object' && !(val instanceof Date)) {
        return this.deepSearch(val, keyword);
      }
      return val.toString().toLowerCase().includes(keyword);
    });
  }


  resetTab() {
    this.resetTabEvent.emit();
  }

  /**
   * This method to get action list by tab
   * @param tab
   * @returns
   */
  getActions(tab: DossierTabs): any[] {
    return this.actions.filter((act) => act.authorizedTabs.includes(tab) && this.permManager.isGranted(act.permissions));
  }

  fetchCountTabData(tab: DossierTabs, event: any): void {
    const selectedTab = this.tabConfig[tab];
    selectedTab.count=event?.size;
  }

  resumeDossier(dossier: any) {
    this.router.navigateByUrl(`/dossiers/${dossier.uuid}`)
  }

  protected openAbortDialog(uuid: string) {
    const dialogRef = this.openDialog(CommentDialogComponent, {
      title: this.translationService.instantTranslate('dialog.abortDossier.title'),
      commentaireLabel: this.translationService.instantTranslate('dialog.abortDossier.comment.label'),
      commentairePlaceholder: this.translationService.instantTranslate('dialog.abortDossier.comment.placeholder'),
      cancelButton: this.translationService.instantTranslate('button.cancel.label'),
      validateButton: this.translationService.instantTranslate('button.abort.label')
    });

    let abortSubscription = dialogRef.componentInstance.validation.subscribe((motif: string) => {
      this.dossierDataService.abortDossier(uuid, motif).subscribe(dossier => {
        this.fetchTabData(this.activeTab, {});
        dialogRef.close();
      });
    });

    dialogRef.afterClosed().subscribe(() => {
      abortSubscription.unsubscribe();
    });
  }

  protected openAssignDialog(dossier: any = {}){
    const dialogRef = this.openDialog(AssignUserDialogComponent, { dossier });
    dialogRef.afterClosed().subscribe((result) => {
      if(result){
        this.fetchTabData(this.activeTab, {});
      }
    });
  }

  protected openReassignDialog(dossier: any = {}){
    if (this.userService.hasRole([Role.DELIVERY_MANAGER])){
       this.checkAuthorizedRessign(dossier);
    }else {
     const dialogRef = this.openDialog(ReassignUserDialogComponent, { dossier: {...dossier, codeDossier: dossier.numeroDossier }});
     dialogRef.componentInstance.validation.subscribe((dossier: DossierData) => {
       if(dossier){
          this.fetchTabData(this.activeTab, {});
       }
     });
    }
  }

  protected checkAuthorizedRessign(dossier: any={}):void {
    this.dossierDataService.checkDossierAuthorizedReassign(dossier.uuid)
    .subscribe({
      next: (data: any) => {
        if (!data) this.showErrorMessage({ bodyKey: 'dossier.reaasignNotAllowed.message.body'});
        else {
            const dialogRef = this.openDialog(ReassignUserDialogComponent, { dossier: {...dossier, codeDossier: dossier.numeroDossier } });
            dialogRef.afterClosed().subscribe((result) => {
              this.changeDetectorRef.detectChanges();
            });
        }
      },
      error: (err) => {
        this.logService.error("Error", err);
      }
    });
  }

  protected assignToMe(uuid: any) {
    if (uuid) {
      this.dossierDataService.assignToMe(uuid).subscribe({
        next: (dossier) => {
          this.showSuccessMessage({bodyKey: "action.success.message"});
          this.fetchTabData(this.activeTab, {});
        },
        error: (err) => {
          this.logService.error("Error", err);
        }
      });
      this.changeDetectorRef.detectChanges();
    }
  }

  protected openReassignRequestDialog(dossier: any = {}){
    const dialogRef = this.openDialog(ReassignRequestViewDialogComponent, { dossier });
    dialogRef.componentInstance.validation.subscribe((success: boolean) => {
     if(success){
      this.fetchTabData(this.activeTab, {});
     }
    })
  }

  private onTransferRespRiskDialog(dossier: any): void {
      const  riskProfessions=['ARR','ROR','RORE','DRR'];
      const professions= riskProfessions.filter( p => this.userService.currentUserCodeProfession !== p );
      const searchCriteria: UserrSearchCriteria={ codeProfessions:professions }
      const dialogRef = this.openDialog(TransmettreDialogComponent,{
        title: this.translationService.instantTranslate("transmettre.dossier.title", {codeDossier: dossier.numeroDossier}),
        userLabel: this.translationService.instantTranslate("Utilisateur"),
        searchCriteria
      });
      dialogRef.componentInstance.validation.pipe(take(1)).subscribe((data: any) => {
        if (dossier.uuid) {
          this.dossierDataService.reassignDossier(dossier.uuid, data.matricule, data.comment,false).subscribe({
            next: () => {
              this.fetchTabData(this.activeTab, {});
              this.showSuccessMessage({ bodyKey: "action.success.message" });
            },
            error: () => {
              this.showErrorMessage({ bodyKey: "action.error.message" });
            }
          });
        }
        dialogRef.close();
      })
    }
}
