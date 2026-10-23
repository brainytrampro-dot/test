package ma.sg.its.octroicreditapi.service.impl;
import com.sgma.ms.bpm.client.model.ActivateProcessResult;
import com.sgma.ms.bpm.client.model.StartProcessResult;
import com.sgma.ms.bpm.client.model.TaskResult;
import lombok.extern.slf4j.Slf4j;
import ma.sg.its.octroicredit.common.constant.Errors;
import ma.sg.its.octroicredit.common.context.ApplicationContextHolder;
import ma.sg.its.octroicredit.common.dto.NotificationContext;
import ma.sg.its.octroicredit.common.dto.RefStatusDto;
import ma.sg.its.octroicredit.common.dto.UserDto;
import ma.sg.its.octroicredit.common.exception.TechnicalException;
import ma.sg.its.octroicredit.common.service.ReferentialService;
import ma.sg.its.octroicredit.common.service.UserService;
import ma.sg.its.octroicredit.common.service.WorkflowService;
import ma.sg.its.octroicredit.common.service.WorkflowTaskCompletion;
import ma.sg.its.octroicreditapi.client.DossierDataClient;
import ma.sg.its.octroicreditapi.client.TaskClient;
import ma.sg.its.octroicreditapi.constant.WorkflowConstants;
import ma.sg.its.octroicreditapi.dto.TaskDto;
import ma.sg.its.octroicreditapi.dto.core.DossierDataCoreDto;
import ma.sg.its.octroicreditapi.enumeration.DossierStatus;
import ma.sg.its.octroicreditapi.enumeration.Role;
import ma.sg.its.octroicreditapi.helper.DossierDataHelper;
import ma.sg.its.octroicreditapi.mapper.DossierUserDtoMapper;
import ma.sg.its.octroicreditapi.service.PPWorkflowService;
import ma.sg.its.octroicreditapi.strategies.*;
import ma.sg.its.octroicreditapi.strategies.agencyNotif.NotifyDADossierStrategy;
import ma.sg.its.octroicreditapi.strategies.agencyNotif.NotifyDAFODossierStrategy;
import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.util.Assert;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.*;
import java.util.function.Predicate;
import java.util.stream.Collectors;

@Service
@Slf4j
public class PPWorkflowServiceImpl implements PPWorkflowService {

    public static final String REQUEST_EXPERTISE        = "request_expertise";
    public static final String EXPORTISE_RAPPORT_SHIPMENT = "exportise_rapport_shipment";
    public static final String EXPERTISE_SHIPMENT       = "expertise_shipment";

    @Value("${application.bpm.process.definition-key.loan}")
    private String ppLoanProcessDefinitionKey;

    @Autowired private WorkflowService      workflowService;
    @Autowired private TaskClient           taskClient;
    @Autowired private UserService          userService;
    @Autowired private NotifyStrategyFactory notifyStrategyFactory;
    @Autowired private DossierDataClient    dossierDataClient;
    @Autowired private DossierUserDtoMapper dossierUserDtoMapper;
    @Autowired private ApplicationContext   applicationContext;
    @Autowired private DossierDataHelper    dossierDataHelper;
    @Autowired private ReferentialService   referentialService;

    @Autowired private CamundaTaskExecutor     camundaTaskExecutor;
    @Autowired private DossierStateUpdater     dossierStateUpdater;
    @Autowired private NextTaskProcessorService nextTaskProcessorService;
    @Autowired private TransitionDeltaPersister transitionDeltaPersister;

    @Lazy
    @Autowired
    private PPWorkflowServiceImpl self;

    @Override
    public String startLoanProcess(String businessKey) {
        StartProcessResult result = workflowService.startProcess(
                ppLoanProcessDefinitionKey,
                businessKey,
                Collections.singletonMap(WorkflowConstants.INITIATOR_VARIABLE_NAME,
                        ApplicationContextHolder.getUserContext().getUser().getIdentifier()));

        UserDto currentUser = ApplicationContextHolder.getUserContext().getUser();
        taskClient.create(TaskDto.builder()
                .dossierUuid(businessKey)
                .dossierCodeStatus(DossierStatus.INITIATION.getCode())
                .taskUuid(result.getCurrenctActivityId())
                .taskName(result.getCurrenctActivityName())
                .entryDate(result.getStartTime().toInstant().atZone(ZoneId.systemDefault()).toLocalDateTime())
                .userCode(currentUser.getMatricule())
                .build());

        return result.getProcessInstanceId();
    }

    @Override
    public Boolean completeTask(TaskResult task,
                                Map<String, String> variables,
                                DossierDataCoreDto dossier) {
        Assert.notNull(task, Errors.TASK_SHOULD_BE_NOT_NULL);
        log.info("completeTask: start for dossier [{}] status [{}]",
                dossier.getUuid(), dossier.getCodeStatus());

        transitionDeltaPersister.persist(dossier);

        ActivateProcessResult camundaResult = camundaTaskExecutor.executeWithRetry(
                task, dossier, prepareVariables(variables));

        if (!camundaResult.getSuccess()) {
            log.error("completeTask: Camunda failed definitively for dossier [{}]",
                    dossier.getUuid());
            return false;
        }
        TaskResult mainTask = null;
        if (!DossierStatus.FULL_RELEASE.getCode().equals(dossier.getCodeStatus())) {
            mainTask = nextTaskProcessorService.processNextTask(dossier);
        }
        TaskDto taskDto = TaskDto.builder()
                .taskUuid(task.getTaskId())
                .userPoste(ApplicationContextHolder.getUserContext().getUser().getPoste())
                .exitDate(LocalDateTime.now())
                .build();
        dossierStateUpdater.update(dossier, taskDto);
        if (mainTask != null) {
            notifyTransition(dossier, task, mainTask);
        }

        log.info("completeTask: completed for dossier [{}]", dossier.getUuid());
        return true;
    }

    private void notifyTransition(DossierDataCoreDto dossier, TaskResult oldTask, TaskResult newTask) {
        UserDto connectedUser = ApplicationContextHolder.getUserContext().getUser();
        NotificationContext ctx = NotificationContext.builder()
                .newTask(newTask).oldTask(oldTask).connectedUser(connectedUser).build();
        try {
            NotifyReceiveDossierStrategy receive =
                    notifyStrategyFactory.getStrategy(NotifyReceiveDossierStrategy.class);
            if (receive != null) receive.sendNotification(dossier, ctx);

            String market = (dossier.getCustomerData() != null
                    && dossier.getCustomerData().getCard() != null)
                    ? dossier.getCustomerData().getCard().getMarket() : null;
            Class<? extends NotifyDossierStrategy> daType =
                    market != null && market.contains("09")
                            ? NotifyDAFODossierStrategy.class : NotifyDADossierStrategy.class;

            NotifyDossierStrategy da = notifyStrategyFactory.getStrategy(daType);
            if (da != null) da.sendNotification(dossier, ctx);
        } catch (Exception ex) {
            log.error("completeTask: notification failed for dossier [{}] — non-blocking : {}",
                    dossier.getUuid(), ex.getMessage());
        }
    }


    private Map<String, String> prepareVariables(Map<String, String> variables) {
        return variables != null ? new HashMap<>(variables) : new HashMap<>();
    }


    @Override
    public List<TaskResult> getUserTasks(String assignee, String group) {
        return workflowService.getCurrentTasks(assignee, group, null);
    }

    @Override
    public TaskResult getCurrentTask(String assignee, String businessKey) {
        return getFilteredTask(workflowService.getCurrentTasks(assignee, null, businessKey));
    }

    @Override
    public TaskResult getTask(String businessKey) {
        return getFilteredTask(workflowService.getTasks(businessKey));
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


        boolean isInitiator = Optional.ofNullable(connectedUser.getRoles())
                .map(roles -> roles.stream().anyMatch(role -> "INITIATOR".equals(role.getCode())))
                .orElse(false);
        boolean isExpert    = "CTB_EXPASS".equals(codeProfession);

        if (isInitiator) {
            List<TaskResult> assigned = tasks.stream()
                    .filter(t -> connectedUser.getIdentifier().equals(t.getAssignee()))
                    .collect(Collectors.toList());
            if (!assigned.isEmpty()) {
                return assigned.stream()
                        .filter(t -> initiatorPrimary.contains(t.getActivityName()))
                        .findFirst()
                        .orElse(assigned.get(0));
            }
        }

        Predicate<TaskResult> predicate =
                isInitiator ? t -> initiatorPrimary.contains(t.getActivityName())
                        || initiatorFallback.contains(t.getActivityName())
                        : isExpert    ? t -> expertPrimary.contains(t.getActivityName())
                        || expertSecondary.contains(t.getActivityName())
                        :                t -> !expertActivities.contains(t.getActivityName());

        List<TaskResult> filtered = tasks.stream().filter(predicate).collect(Collectors.toList());
        return filtered.isEmpty() ? null : filtered.get(0);
    }


    @Override
    public Boolean updateTask(TaskResult task, Map<String, String> variables) {
        Assert.notNull(task, Errors.TASK_SHOULD_BE_NOT_NULL);
        return workflowService.updateTask(task.getTaskId(), variables).getSuccess();
    }

    @Override
    public Boolean assignTask(DossierDataCoreDto dossier, UserDto userDto) {
        try {
            TaskResult task = this.getTask(dossier.getUuid());
            Assert.notNull(task, Errors.TASK_SHOULD_BE_NOT_NULL);
            String oldAssignee = task.getAssignee();
            task.setAssignee(userDto.getMatricule());
            task.setProcessInstanceId(dossier.getProcessId());

            WorkflowTaskCompletion<DossierDataCoreDto, ? extends Serializable> completion =
                    applicationContext.getBean(task.getActivityName(), WorkflowTaskCompletion.class);

            assignTaskAndUpdateVariables(task, userDto, completion);
            updateDossierUserAndCreateTask(dossier, task, userDto);
            notifyBothAgents(dossier, oldAssignee, userDto);
            return true;
        } catch (RuntimeException ex) {
            log.error("assignTask: failed for dossier [{}] to user [{}] : {}",
                    dossier.getUuid(), userDto.getIdentifier(), ex.getMessage());
            return false;
        }
    }

    private void assignTaskAndUpdateVariables(TaskResult task, UserDto userDto,
                                              WorkflowTaskCompletion<DossierDataCoreDto, ? extends Serializable> completion) {
        var assignResult = workflowService.assignTask(task.getTaskId(), userDto.getIdentifier());
        Map<String, String> vars = new HashMap<>();
        vars.put(completion.getAssigneeVariable(), userDto.getIdentifier());
        var updateResult = workflowService.updateParams(task.getExecutionId(), vars);
        if (!updateResult.getSuccess() || !assignResult.getSuccess()) {
            throw new TechnicalException("Failed to assign task or update variables");
        }
    }

    private void updateDossierUserAndCreateTask(DossierDataCoreDto dossier, TaskResult task, UserDto userDto) {
        RefStatusDto refStatus = referentialService.getStatusByCode(dossier.getCodeStatus())
                .orElseThrow(() -> new TechnicalException("No status for code: " + dossier.getCodeStatus()));
        dossierDataHelper.fillDossierUser(dossier, Role.valueOf(refStatus.getCodeRole()), userDto, task);
        taskClient.update(task.getTaskId(),
                TaskDto.builder().userCode(userDto.getIdentifier()).userPoste(userDto.getPoste()).build());
    }

    private void notifyBothAgents(DossierDataCoreDto dossier, String oldAssignee, UserDto newAgent) {
        UserDto connectedUser = ApplicationContextHolder.getUserContext().getUser();
        TaskResult newTask = new TaskResult();
        TaskResult oldTask = new TaskResult();
        oldTask.setAssignee(oldAssignee);
        if (newAgent != null) newTask.setAssignee(newAgent.getIdentifier());

        NotificationContext ctx = NotificationContext.builder()
                .newTask(newTask).oldTask(oldTask).connectedUser(connectedUser).build();

        NotifyReassignOldAgentDossierStrategy oldStrategy =
                notifyStrategyFactory.getStrategy(NotifyReassignOldAgentDossierStrategy.class);
        if (StringUtils.isNotBlank(oldAssignee) && oldStrategy != null) {
            oldStrategy.sendNotification(dossier, ctx);
        }

        NotifyReassignNewAgentDossierStrategy newStrategy =
                notifyStrategyFactory.getStrategy(NotifyReassignNewAgentDossierStrategy.class);
        if (newAgent != null && StringUtils.isNotBlank(newAgent.getIdentifier()) && newStrategy != null) {
            newStrategy.sendNotification(dossier, ctx);
        }

        String market = (dossier.getCustomerData() != null && dossier.getCustomerData().getCard() != null)
                ? dossier.getCustomerData().getCard().getMarket() : null;
        Class<? extends NotifyDossierStrategy> daType =
                market != null && market.contains("09")
                        ? NotifyDAFODossierStrategy.class : NotifyDADossierStrategy.class;
        NotifyDossierStrategy da = notifyStrategyFactory.getStrategy(daType);
        if (newAgent != null && StringUtils.isNotBlank(newAgent.getIdentifier()) && da != null) {
            da.sendNotification(dossier, ctx);
        }
    }

    public Boolean abortLoanProcess(String processId) {
        return workflowService.abortProcess(processId);
    }
}
