package ma.sg.its.octroicreditapi.service.impl;

import com.sgma.ms.bpm.client.model.TaskResult;
import ma.sg.its.octroicredit.common.constant.MessageKeyConstants;
import ma.sg.its.octroicredit.common.dto.RefStatusDto;
import ma.sg.its.octroicredit.common.enumeration.StatusType;
import ma.sg.its.octroicredit.common.util.Assert;
import ma.sg.its.octroicreditapi.constant.WorkflowConstants;
import ma.sg.its.octroicreditapi.dto.CommentDto;
import ma.sg.its.octroicreditapi.dto.DossierDataDto;
import ma.sg.its.octroicreditapi.dto.DossierRequestDto;
import ma.sg.its.octroicreditapi.dto.WorkflowTaskCompletionDto;
import ma.sg.its.octroicreditapi.dto.core.DossierDataCoreDto;
import ma.sg.its.octroicreditapi.enumeration.DossierStatus;
import ma.sg.its.octroicreditapi.helper.DossierDataHelper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service("additional_info_feedback")
public class AdditionalInfoFeedbackTaskCompletion extends DossierWorkflowTaskCompletion<WorkflowTaskCompletionDto> {

	@Autowired
	private DossierDataHelper dossierDataHelper;

	@Override
	public void execute(TaskResult task, DossierDataCoreDto dossier, WorkflowTaskCompletionDto workflowTaskCompletionDto) {

		switch (workflowTaskCompletionDto.getOperationResult()) {
			case BACK_TO_DECISION:
				backToDecision(task, dossier);
				break;
			default:
				accept(task, dossier, workflowTaskCompletionDto.getComment());
				break;
		}
	}

	@Override
	public String getAssigneeVariable() {
		return WorkflowConstants.INITIATOR_VARIABLE_NAME;
	}

	public void accept(TaskResult task, DossierDataCoreDto dossier, CommentDto comment) {
		Assert.True( (dossier.getCodeStatus()!=null && dossier.getCodeStatus().contains(DossierStatus.ADDITIONAL_AGENCY_INFORMATION.getCode())) ||
						"INCA_EXP".equals(dossier.getTaskStatus()),
				messageService.getMessage(MessageKeyConstants.API_ACTION_NOT_ALLOWED_STATUS_NOT_VALID));

		boolean incaExp = "INCA_EXP".equals(dossier.getTaskStatus());
		if (!incaExp) {
			RefStatusDto previousStatus = referentialService.getStatusTarget(dossier.getCodeStatus(), StatusType.ON_SUCCESS);
			Assert.notNull(previousStatus, "on success status should not be null");
			if (DossierStatus.COMPLIANCE_CONTROL.getCode().equals(previousStatus.getCode())) {
				checkAllMandatoryAttachmentTypesHasAttachments(dossier.getUuid());
			}
			dossier.setCodeStatus(previousStatus.getCode());
		}

		dossierDataHelper.purgeNonUpdatableDossierFields(dossier);
		if(comment != null) { dossierDataHelper.fillComment(comment, dossier); }

		ppWorkflowService.completeTask(task, null, dossier);
	}

	private void backToDecision(TaskResult task, DossierDataCoreDto dossier) {
		Assert.contains(dossier.getCodeStatus(), DossierStatus.ADDITIONAL_AGENCY_INFORMATION.getCode(),
				messageService.getMessage(MessageKeyConstants.API_ACTION_NOT_ALLOWED_STATUS_NOT_VALID));

		RefStatusDto previousDossierStatus = referentialService.getStatusTarget(dossier.getCodeStatus(),StatusType.ON_SUCCESS);
		dossierDataHelper.purgeNonUpdatableDossierFields(dossier);
		dossier.setCodeStatus(previousDossierStatus.getCode());
		ppWorkflowService.completeTask(task, null, dossier);
	}
}
//////////////////////////////////////////////////////////::::::
@Service
@Slf4j
public class DossierDataServiceImpl implements DossierDataService {



	@Override
	public <T extends Serializable> DossierDataDto advanceDossier(DossierDataCoreDto dossier, T object) throws Exception {

		if (dossier == null) {
			throw new TechnicalException(Errors.DOSSIER_SHOULD_NOT_BE_NULL);
		}

		AuditContextHolder.setObjectId(dossier.getUuid());
		TaskResult task = getCurrentUserTask(dossier.getUuid());
		Assert.notNull(task, "Current Task should be not null");
		UserDto userDto = ApplicationContextHolder.getUserContext().getUser();
		Assert.equals(task.getAssignee(), userDto.getIdentifier(),
				"Sorry, You cannot execute this task isn't assigned to you");
		WorkflowTaskCompletion<DossierDataCoreDto, T> workflowTaskCompletion = applicationContext.getBean(task.getActivityName(),
				WorkflowTaskCompletion.class);

		dossier.setCodeStage(getCodeStage(dossier.getCodeStatus()));
		dossier.setDesignationProduct(getProductLabel(dossier));
		dossier.setTaskStatus(getTaskStatus(dossier.getCodeStatus(),task,dossier.getDossierAttachmentTypes()));
		workflowTaskCompletion.execute(task, dossier, object);

		log.info("Task is completed and start updating dossier {} {}", dossier.getUuid(), dossier.getCodeStatus());
        dossierDataClient.update(dossier.getUuid(), dossier);
        log.info("End updating dossier {} {}", dossier.getUuid(), dossier.getCodeStatus());
 
		return retrieveByUuid(task.getCaseInstanceId());
	}


	///////////////////////////////////////////////////////////////////////////////////////////////////////

@Service
@Slf4j
public class PPWorkflowServiceImpl implements PPWorkflowService {

    public static final String REQUEST_EXPERTISE = "request_expertise";
    public static final String EXPORTISE_RAPPORT_SHIPMENT = "exportise_rapport_shipment";
    public static final String EXPERTISE_SHIPMENT = "expertise_shipment";

    @Value("${application.bpm.process.definition-key.loan}")
    private String ppLoanProcessDefinitionKey;

    @Autowired private WorkflowService workflowService;
    @Autowired private TaskClient taskClient;
    @Autowired private UserService userService;
    @Autowired private NotifyStrategyFactory notifyStrategyFactory;
    @Autowired private DossierDataClient dossierDataClient;
    @Autowired private DossierUserDtoMapper dossierUserDtoMapper;
    @Autowired private ApplicationContext applicationContext;
    @Autowired private DossierDataHelper dossierDataHelper;
    @Autowired private ReferentialService referentialService;

    /** Service dédié à la récupération de la prochaine tâche Camunda avec retry exponentiel. */
    @Autowired
    private NextTaskProcessorService nextTaskProcessorService;

    @Lazy
    @Autowired
    private PPWorkflowServiceImpl self;


    @Override
    public String startLoanProcess(String businessKey) {
        StartProcessResult startProcessResult = workflowService.startProcess(
                ppLoanProcessDefinitionKey,
                businessKey,
                Collections.singletonMap(WorkflowConstants.INITIATOR_VARIABLE_NAME,
                        ApplicationContextHolder.getUserContext().getUser().getIdentifier()));

        UserDto currentUser = ApplicationContextHolder.getUserContext().getUser();
        TaskDto taskDto = TaskDto.builder()
                .dossierUuid(businessKey)
                .dossierCodeStatus(DossierStatus.INITIATION.getCode())
                .taskUuid(startProcessResult.getCurrenctActivityId())
                .taskName(startProcessResult.getCurrenctActivityName())
                .entryDate(startProcessResult.getStartTime().toInstant().atZone(ZoneId.systemDefault()).toLocalDateTime())
                .userCode(currentUser.getMatricule())
                .build();

        taskClient.create(taskDto);
        return startProcessResult.getProcessInstanceId();
    }

    @Override
    @DossierSyncFlow
    public Boolean completeTask(TaskResult task, Map<String, String> variables, DossierDataCoreDto dossier) {
        Assert.notNull(task, Errors.TASK_SHOULD_BE_NOT_NULL);
        log.info("Start complete task {}, variables: {}", task, variables);

        Map<String, String> variablesTmp = prepareVariables(variables);

        ActivateProcessResult activateProcessResult = self.executeWorkflow(task, dossier, variablesTmp);

        DossierDataDto newdossier = updateDossierAndTask(dossier, task);

        if (DossierStatus.FULL_RELEASE.getCode().equals(dossier.getCodeStatus())) {
            return activateProcessResult.getSuccess();
        }

        TaskResult newTask = nextTaskProcessorService.processNextTask(dossier);

        if (newTask == null) {
            log.warn("No next task returned for dossier {} after all retries — skipping notification", dossier.getUuid());
            return activateProcessResult.getSuccess();
        }

        dossier.setAssignee(newTask.getAssignee());
        dossier.setPoolCandidate(newTask.getAssignee() == null);
        dossier.setComments(newdossier.getComments());
        notifyAgentAndDAWrapper(dossier, newTask, task);

        return activateProcessResult.getSuccess();
    }


    @Retryable(
            retryFor = WorkflowException.class,
            maxAttempts = 5,
            backoff = @Backoff(delay = 2000, multiplier = 2, maxDelay = 32000)
    )
    public ActivateProcessResult executeWorkflow(TaskResult task, DossierDataCoreDto dossier, Map<String, String> variablesTmp) {
        variablesTmp.put("currentStatus", dossier.getCodeStatus());
        variablesTmp.put("userPoste", ApplicationContextHolder.getUserContext().getUser().getPoste());
        try {
            ActivateProcessResult result = workflowService.completeTask(task, variablesTmp);
            if (!result.getSuccess()) {
                log.warn("completeTask returned success=false pour le dossier {} — retry en cours...", dossier.getUuid());
                throw new WorkflowException(dossier.getUuid(), WorkflowException.WorkflowExceptionEnum.CAMUNDA_ERROR);
            }
            return result;
        } catch (WorkflowException ex) {
            throw ex; // relancer pour déclencher le retry Spring
        } catch (Exception ex) {
            log.error("completeTask failed for dossier {} : {}", dossier.getUuid(), ex.getMessage());
            throw new WorkflowException(dossier.getUuid(), WorkflowException.WorkflowExceptionEnum.CAMUNDA_ERROR,
                    ex.getCause() != null ? ex.getCause() : ex);
        }
    }



    private DossierDataDto updateDossierAndTask(DossierDataCoreDto dossier, TaskResult task) {
        TaskDto taskDto = TaskDto.builder()
                .taskUuid(task.getTaskId())
                .userPoste(ApplicationContextHolder.getUserContext().getUser().getPoste())
                .exitDate(LocalDateTime.now())
                .build();

        UpdateDossierAndTaskRequest updateRequest = UpdateDossierAndTaskRequest.builder()
                .dossier(dossier)
                .task(taskDto)
                .build();
        try {
            log.info("updating dossier and task");
            return dossierDataClient.updateDossierAndTask(updateRequest);
        } catch (Exception ex) {
            log.error("update dossier {} and task {} failed with ex {}", dossier, taskDto, ex.getMessage());
            throw new WorkflowException(dossier.getUuid(),
                    WorkflowException.WorkflowExceptionEnum.CORE_UPDATE_TASK_AND_DOSSIER_ERROR,
                    ex.getCause() != null ? ex.getCause() : ex);
        }
    }

    private Map<String, String> prepareVariables(Map<String, String> variables) {
        return variables != null ? new HashMap<>(variables) : new HashMap<>();
    }

    private void notifyAgentAndDAWrapper(DossierDataCoreDto dossier, TaskResult newTask, TaskResult oldTask) {
        UserDto connectedUser = ApplicationContextHolder.getUserContext().getUser();
        log.info("Start notifyAgentAndDA");
        notifyAgentAndDA(dossier, newTask, oldTask, connectedUser);
        log.info("End notifyAgentAndDA");
    }

    private void notifyAgentAndDA(DossierDataCoreDto dossier, TaskResult newTask, TaskResult task, UserDto connectedUser) {
        NotifyReceiveDossierStrategy notifyReceiveDossierStrategy = notifyStrategyFactory.getStrategy(NotifyReceiveDossierStrategy.class);
        if (notifyReceiveDossierStrategy != null) {
            notifyReceiveDossierStrategy.sendNotification(dossier,
                    NotificationContext.builder().newTask(newTask).oldTask(task).connectedUser(connectedUser).build());
        }
        Class<? extends NotifyDossierStrategy> type = getDANotificationStrategy(dossier.getCustomerData().getCard().getMarket());
        NotifyDossierStrategy notifySupDossierStrategy = notifyStrategyFactory.getStrategy(type);
        if (notifySupDossierStrategy != null) {
            notifySupDossierStrategy.sendNotification(dossier,
                    NotificationContext.builder().newTask(newTask).oldTask(task).connectedUser(connectedUser).build());
        }
    }

    private static Class<? extends NotifyDossierStrategy> getDANotificationStrategy(String marketCode) {
        Class<? extends NotifyDossierStrategy> type = NotifyDADossierStrategy.class;
        if (marketCode != null && marketCode.contains("09")) {
            type = NotifyDAFODossierStrategy.class;
        }
        return type;
    }


    @Override
    public List<TaskResult> getUserTasks(String assignee, String group) {
        return workflowService.getCurrentTasks(assignee, group, null);
    }

    @Override
    public TaskResult getCurrentTask(String assignee, String businessKey) {
        List<TaskResult> tasks = workflowService.getCurrentTasks(assignee, null, businessKey);
        return getFilteredTask(tasks);
    }

    @Override
    public TaskResult getTask(String businessKey) {
        List<TaskResult> tasks = workflowService.getTasks(businessKey);
        return getFilteredTask(tasks);
    }

    private TaskResult getFilteredTask(List<TaskResult> tasks) {
        if (tasks == null || tasks.isEmpty()) return null;
        if (tasks.size() == 1) return tasks.get(0);

        UserDto connectedUser = ApplicationContextHolder.getUserContext().getUser();
        String codeProfession = connectedUser.getCodeProfession();

        List<String> expertPrimary     = Arrays.asList(REQUEST_EXPERTISE, EXPORTISE_RAPPORT_SHIPMENT);
        List<String> expertSecondary   = Arrays.asList("additional_info_feedback", EXPERTISE_SHIPMENT);
        List<String> initiatorPrimary  = Arrays.asList("additional_info_feedback", EXPERTISE_SHIPMENT);
        List<String> initiatorFallback = Arrays.asList(REQUEST_EXPERTISE, EXPERTISE_SHIPMENT, EXPORTISE_RAPPORT_SHIPMENT);
        List<String> expertActivities  = Arrays.asList(REQUEST_EXPERTISE, EXPERTISE_SHIPMENT, EXPORTISE_RAPPORT_SHIPMENT);

        boolean isInitiator = Arrays.asList("CCP", "CCPRO", "CCPBG", "DA").contains(codeProfession);
        boolean isExpert    = Arrays.asList("CTB_EXPASS").contains(codeProfession);

        if (isInitiator) {
			List<TaskResult> assignedTasks = tasks.stream()
                    .filter(task -> connectedUser.getIdentifier().equals(task.getAssignee()))
                    .collect(Collectors.toList());
			if (!assignedTasks.isEmpty()) {
				return assignedTasks.stream()
						.filter(t -> initiatorPrimary.contains(t.getActivityName()))
						.findFirst()
						.orElse(assignedTasks.get(0));
        }

		}
        Predicate<TaskResult> filterPredicate =
                isInitiator ? task -> initiatorPrimary.contains(task.getActivityName())
                                   || initiatorFallback.contains(task.getActivityName())
              : isExpert    ? task -> expertPrimary.contains(task.getActivityName())
                                   || expertSecondary.contains(task.getActivityName())
              :                task -> !expertActivities.contains(task.getActivityName());

        List<TaskResult> filteredTasks = tasks.stream()
                .filter(filterPredicate)
                .collect(Collectors.toList());

        return filteredTasks.isEmpty() ? null : filteredTasks.get(0);
    }


    @Override
    public Boolean updateTask(TaskResult task, Map<String, String> variables) {
        Assert.notNull(task, Errors.TASK_SHOULD_BE_NOT_NULL);
        ActivateProcessResult result = workflowService.updateTask(task.getTaskId(), variables);
		//TODO : set the correct return value
        return result.getSuccess();
    }

    /**
     * Assigne un dossier à un utilisateur et met à jour les variables du workflow.
     *
     * @param dossier le dossier à assigner
     * @param userDto le nouvel utilisateur assigné
     * @return true si l'assignation a réussi, false sinon
     */
    @Override
    public Boolean assignTask(DossierDataCoreDto dossier, UserDto userDto) {
        try {
            TaskResult task = this.getTask(dossier.getUuid());
            Assert.notNull(task, Errors.TASK_SHOULD_BE_NOT_NULL);
            String oldAssignee = task.getAssignee();
            task.setAssignee(userDto.getMatricule());
            task.setProcessInstanceId(dossier.getProcessId());

            WorkflowTaskCompletion<DossierDataCoreDto, ? extends Serializable> workflowTaskCompletion =
                    getWorkflowTaskCompletion(task.getActivityName());

            assignTaskAndUpdateVariables(task, userDto, workflowTaskCompletion);
            updateDossierUserAndCreateNextTask(dossier, task, userDto);
            notifyBothAgents(dossier, oldAssignee, userDto);
            return true;
        } catch (RuntimeException ex) {
            log.error("Cannot assign dossier to {} caused by {}", userDto.getIdentifier(), ex.getMessage());
            return false;
        }
    }

    private void notifyBothAgents(DossierDataCoreDto dossier, String oldAssigne, UserDto newAgent) {
        UserDto connectedUser = ApplicationContextHolder.getUserContext().getUser();
        TaskResult newTask = new TaskResult();
        TaskResult oldTask = new TaskResult();
        oldTask.setAssignee(oldAssigne);
		if (!Objects.isNull(newAgent))
            newTask.setAssignee(newAgent.getIdentifier());

		NotifyReassignOldAgentDossierStrategy notifyOldAgentStratgy = notifyStrategyFactory.getStrategy(NotifyReassignOldAgentDossierStrategy.class);
		if (StringUtils.isNotBlank(oldAssigne) && notifyOldAgentStratgy != null) {
			notifyOldAgentStratgy.sendNotification(dossier, NotificationContext.builder().newTask(newTask).oldTask(oldTask).connectedUser(connectedUser).build());
        }

		NotifyReassignNewAgentDossierStrategy notifyNewAgentStratgy = notifyStrategyFactory.getStrategy(NotifyReassignNewAgentDossierStrategy.class);
		if (newAgent != null && StringUtils.isNotBlank(newAgent.getIdentifier()) && notifyNewAgentStratgy != null) {
			notifyNewAgentStratgy.sendNotification(dossier, NotificationContext.builder().newTask(newTask).oldTask(oldTask).connectedUser(connectedUser).build());
        }

        Class<? extends NotifyDossierStrategy> type = getDANotificationStrategy(dossier.getCustomerData().getCard().getMarket());
        NotifyDossierStrategy notifyDAAgencyDossierStrategy = notifyStrategyFactory.getStrategy(type);
        if (newAgent != null && StringUtils.isNotBlank(newAgent.getIdentifier()) && notifyDAAgencyDossierStrategy != null) {
            notifyDAAgencyDossierStrategy.sendNotification(dossier,
                    NotificationContext.builder().newTask(newTask).oldTask(oldTask).connectedUser(connectedUser).build());
        }
    }

    private WorkflowTaskCompletion<DossierDataCoreDto, ? extends Serializable> getWorkflowTaskCompletion(String activityName) {
        return applicationContext.getBean(activityName, WorkflowTaskCompletion.class);
    }

    private void assignTaskAndUpdateVariables(TaskResult task, UserDto userDto,
                                              WorkflowTaskCompletion<DossierDataCoreDto, ? extends Serializable> workflowTaskCompletion) {
        ActivateProcessResult assignResult = workflowService.assignTask(task.getTaskId(), userDto.getIdentifier());
        Map<String, String> variables = new HashMap<>();
        variables.put(workflowTaskCompletion.getAssigneeVariable(), userDto.getIdentifier());
        ActivateProcessResult updateResult = workflowService.updateParams(task.getExecutionId(), variables);
        if (!updateResult.getSuccess() || !assignResult.getSuccess()) {
            throw new TechnicalException("Failed to assign task or update variables");
        }
    }

    private void updateDossierUserAndCreateNextTask(DossierDataCoreDto dossier, TaskResult task, UserDto userDto) {
        RefStatusDto refStatusDto = referentialService.getStatusByCode(dossier.getCodeStatus())
                .orElseThrow(() -> new TechnicalException("No Status found for code: " + dossier.getCodeStatus()));
        dossierDataHelper.fillDossierUser(dossier, Role.valueOf(refStatusDto.getCodeRole()), userDto);
        taskClient.update(task.getTaskId(),
                TaskDto.builder().userCode(userDto.getIdentifier()).userPoste(userDto.getPoste()).build());
    }

    public Boolean abortLoanProcess(String processId) {
        return workflowService.abortProcess(processId);
    }

}


	/////////////////////////////////

	package ma.sg.its.octroicreditapi.service.impl;

import com.sgma.ms.bpm.client.model.TaskResult;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import ma.sg.its.octroicredit.common.exception.WorkflowException;
import ma.sg.its.octroicreditapi.client.DossierDataClient;
import ma.sg.its.octroicreditapi.client.TaskClient;
import ma.sg.its.octroicreditapi.dto.TaskDto;
import ma.sg.its.octroicreditapi.dto.core.DossierDataCoreDto;
import ma.sg.its.octroicredit.common.service.WorkflowService;
import org.springframework.retry.annotation.Backoff;
import org.springframework.retry.annotation.Recover;
import org.springframework.retry.annotation.Retryable;
import org.springframework.stereotype.Service;

import java.time.ZoneId;
import java.util.List;

@Service
@Slf4j
@RequiredArgsConstructor
public class NextTaskProcessorService {

    private final WorkflowService workflowService;
    private final TaskClient taskClient;
    private final DossierDataClient dossierDataClient;

    @Retryable(
            retryFor = WorkflowException.class,
            maxAttempts = 5,
            backoff = @Backoff(delay = 2000, multiplier = 2, maxDelay = 32000)
    )
    public TaskResult processNextTask(DossierDataCoreDto dossier) {
        log.info("Interrogation de Camunda pour la prochaine tâche du dossier {} , {}", dossier.getUuid(),dossier.getCodeStatus());

        List<TaskResult> tasks;
        try {
            tasks = workflowService.getTasks(dossier.getUuid());
        } catch (Exception ex) {
            log.info("Erreur lors de l'appel getTasks pour le dossier {} : {}", dossier.getUuid(), ex.getMessage(), ex);
            throw new WorkflowException(
                    dossier.getUuid(),
                    WorkflowException.WorkflowExceptionEnum.CAMUNDA_NEXT_TASK_ERROR,
                    ex
            );
        }

        TaskResult newTask = (tasks != null && !tasks.isEmpty()) ? tasks.get(0) : null;

        if (newTask == null) {
            // Camunda n'a pas encore créé la prochaine tâche → retry avec backoff
            log.info("Aucune tâche disponible pour le dossier {} {} — prochain essai dans quelques secondes...", dossier.getUuid(),dossier.getCodeStatus());
            throw new WorkflowException(
                    dossier.getUuid(),
                    WorkflowException.WorkflowExceptionEnum.CAMUNDA_NEXT_TASK_ERROR
            );
        }

        createNextTask(dossier, newTask);
        log.info("Prochaine tâche créée avec succès pour le dossier {} {} : taskId={}, activity={}",
                dossier.getUuid(),dossier.getCodeStatus(), newTask.getTaskId(), newTask.getActivityName());
        return newTask;
    }

    @Recover
    public TaskResult recoverProcessNextTask(WorkflowException ex, DossierDataCoreDto dossier) {
        log.info("Échec définitif après 5 tentatives pour le dossier {} {}. Cause : {}",
                dossier.getUuid(),dossier.getCodeStatus(), ex.getMessage());
        try {
            DossierDataCoreDto dto = DossierDataCoreDto.builder()
                    .uuid(ex.getLoanOrderId())
                    .flowStatus(ex.getMessage())
                    .build();
            dossierDataClient.update(ex.getLoanOrderId(), dto);
        } catch (Exception updateEx) {
            log.info("Impossible de mettre à jour le flowStatus du dossier {} {} : {}",
                    dossier.getUuid(),dossier.getCodeStatus(), updateEx.getMessage(), updateEx);
        }
        return null;
    }

    private void createNextTask(DossierDataCoreDto dossier, TaskResult newTask) {
        TaskDto nextTaskDto = TaskDto.builder()
                .dossierUuid(dossier.getUuid())
                .dossierCodeStatus(dossier.getCodeStatus())
                .taskUuid(newTask.getTaskId())
                .taskName(newTask.getActivityName())
                .entryDate(newTask.getCreated().toInstant().atZone(ZoneId.systemDefault()).toLocalDateTime())
                .userCode(newTask.getAssignee())
                .build();
        try {
            taskClient.create(nextTaskDto);
        } catch (Exception ex) {
            log.info("Impossible de créer la task en base pour le dossier {} {} taskId={} : {} — ignoré",
                    dossier.getUuid(),dossier.getCodeStatus(), newTask.getTaskId(), ex.getMessage());
        }
    }
}

