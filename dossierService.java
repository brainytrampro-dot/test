package ma.sg.its.octroicreditapi.service.impl;

import com.sgma.ms.bpm.client.model.TaskResult;
import jakarta.validation.constraints.NotNull;
import lombok.extern.slf4j.Slf4j;
import ma.sg.its.octroicredit.common.audit.AuditContextHolder;
import ma.sg.its.octroicredit.common.audit.Auditable;
import ma.sg.its.octroicredit.common.audit.AuditableObject;
import ma.sg.its.octroicredit.common.constant.Errors;
import ma.sg.its.octroicredit.common.constant.MessageKeyConstants;
import ma.sg.its.octroicredit.common.context.ApplicationContextHolder;
import ma.sg.its.octroicredit.common.dto.*;
import ma.sg.its.octroicredit.common.enumeration.*;
import ma.sg.its.octroicredit.common.exception.CustomizedException;
import ma.sg.its.octroicredit.common.exception.FunctionalException;
import ma.sg.its.octroicredit.common.exception.TechnicalException;
import ma.sg.its.octroicredit.common.exception.ValidationException;
import ma.sg.its.octroicredit.common.helper.UserHelper;
import ma.sg.its.octroicredit.common.mapper.UserDtoMapper;
import ma.sg.its.octroicredit.common.service.*;
import ma.sg.its.octroicredit.common.util.Assert;
import ma.sg.its.octroicredit.common.util.NumberUtils;
import ma.sg.its.octroicredit.common.validation.ValidationService;
import ma.sg.its.octroicredit.common.validation.group.FunctionalValidationGroup;
import ma.sg.its.octroicredit.common.validation.group.MandatoryValidationGroup;
import ma.sg.its.octroicreditapi.client.ContractPackClient;
import ma.sg.its.octroicreditapi.client.CreditBureauClient;
import ma.sg.its.octroicreditapi.client.DossierDataClient;
import ma.sg.its.octroicreditapi.constant.ApplicationConstants;
import ma.sg.its.octroicreditapi.constant.WorkflowConstants;
import ma.sg.its.octroicreditapi.dto.*;
import ma.sg.its.octroicreditapi.dto.core.*;
import ma.sg.its.octroicreditapi.dto.dossierkpi.KpiDossierData;
import ma.sg.its.octroicreditapi.enumeration.*;
import ma.sg.its.octroicreditapi.helper.DossierDataHelper;
import ma.sg.its.octroicreditapi.mapper.DossierDataDtoMapper;
import ma.sg.its.octroicreditapi.mapper.DossierRequestMapper;
import ma.sg.its.octroicreditapi.mapper.DossierUserDtoMapper;
import ma.sg.its.octroicreditapi.mapper.ReassignmentRequestMapper;
import ma.sg.its.octroicreditapi.model.LoanSegment;
import ma.sg.its.octroicreditapi.service.*;
import ma.sg.its.octroicreditapi.strategies.NotifyFrontOfficeForNewRequestStrategy;
import ma.sg.its.octroicreditapi.strategies.NotifyReassignmentRequesterStrategy;
import ma.sg.its.octroicreditapi.strategies.NotifyStrategyFactory;
import ma.sg.its.octroicreditapi.tools.ObjectUtils;
import ma.sg.its.octroicreditapi.validator.ProspectValidationGroup;
import org.apache.commons.beanutils.BeanUtilsBean;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationContext;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.Serializable;
import java.lang.reflect.InvocationTargetException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.function.Predicate;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static java.math.BigDecimal.ZERO;
import static ma.sg.its.octroicredit.common.constant.MessageKeyConstants.API_ACTION_NOT_ALLOWED;
import static ma.sg.its.octroicredit.common.enumeration.DossierUserEntity.RSTC;
import static ma.sg.its.octroicreditapi.constant.ApplicationConstants.*;
import static ma.sg.its.octroicreditapi.constant.WarrantyConstants.*;
import static ma.sg.its.octroicreditapi.enumeration.DossierListEnum.*;

@Service
@Slf4j
public class DossierDataServiceImpl implements DossierDataService {

	private static final String MCH_09 = "MCH/09";
	private static final String MCH_01 = "MCH/01";
	private static final String CLIENT_PRI = "CLIPRI";
	private static final String CLIENT_PRO = "CLIPRO";
	private static final String MCH_09_PRI = "MCH/09PRI";
	private static final String MCH_09_PRO = "MCH/09PRO";
	private static final String MCH_02 = "MCH/02";
	private static final String MCH_03 = "MCH/03";
	private static final String NOTIFICATION_WITH_SPACE = "notification ";
	private static final String OPC_WITH_SPACE = "opc ";
	private static final String NOTIFICATION_PROSPECT_WITH_SPACE = "NOTIF_PROSPECT";
	private static final String MCH_01_PRI = "MCH/01PRI";
	private static final String MCH_01_PRO = "MCH/01PRO";
	private static final String DEBLOCAGE_TOTAL = "DEBT";
	private static final String ACH_ATTACHMENT_CODE = "BULLTACH";
	private static final Map<String, List<String>> PATCHED_FIELDS_BY_STATUS_CODE;
	private static final String ATTACHMENT_TYPE_NOTIFICATION = "NOTIFICATION";
	private static final String ATTACHMENT_TYPE_OPC = "OPC";
	private static final Map<String, List<String>> STAGE_MAP = new HashMap<>();
	private static final Map<String, List<String>> STAGE_MAP_MARKET_09;
	private static final Map<String, String> POOL_GROUPS = new HashMap<>();
	private static final String DOSSIER_DATA_UUID = "DossierData uuid: ";

	static {
		STAGE_MAP.put(DossierStage.INSTRUCTION.getCode(), ApplicationConstants.INIT_TTY_PROFESSIONS);
		STAGE_MAP.put(DossierStage.VALIDATION.getCode(), ApplicationConstants.VAL_TTY_PROFESSIONS);
		STAGE_MAP.put(DossierStage.DECISION.getCode(), ApplicationConstants.DECS_TTY_PROFESSIONS);


		STAGE_MAP_MARKET_09 = Map.ofEntries(
				Map.entry(DossierStage.INSTRUCTION.getCode(), ApplicationConstants.INIT_TTY_PROFESSIONS_MARKET_09),
				Map.entry(DossierStage.VALIDATION.getCode(), ApplicationConstants.VAL_TTY_PROFESSIONS_MARKET_09),
				Map.entry(DossierStage.DECISION.getCode(), ApplicationConstants.DECS_TTY_PROFESSIONS_MARKET_09));

		POOL_GROUPS.put(DossierStatus.OPCA_TO_VALIDATE.getCode(), WorkflowConstants.SUPERVISORS_VARIABLE_NAME);
		POOL_GROUPS.put(DossierStatus.WARRANTIES_CONTROL.getCode(), WorkflowConstants.COLLATERAL_MANAGER_VARIABLE_NAME);
		POOL_GROUPS.put(DossierStatus.ATDP.getCode(), WorkflowConstants.GBO_GROUP_VARIABLE_NAME);
		POOL_GROUPS.put(DossierStatus.TRAITER_RELATION_NOTAIRE.getCode(), WorkflowConstants.NOTARY_RELATIONSHIP_VARIABLE_NAME);
		POOL_GROUPS.put(DossierStatus.DECISION_RISK.getCode(), WorkflowConstants.ANALYSIS_RISK);
		POOL_GROUPS.put(DossierStatus.AGREEMENT_ANALIST_RETAIL.getCode(), WorkflowConstants.ANALISIS_RETAIL);

		List<String> fields = Arrays.asList(
				DossierDataDto.Fields.uuid,
				DossierDataDto.Fields.loanData + ObjectUtils.PROPERTY_NAME_SEPARATOR
						+ LoanDataDto.Fields.claimedAmountOfPurchase,
				DossierDataDto.Fields.loanData + ObjectUtils.PROPERTY_NAME_SEPARATOR + LoanDataDto.Fields.claimedAmountOfBuildDevelopment,
				DossierDataDto.Fields.loanData + ObjectUtils.PROPERTY_NAME_SEPARATOR
						+ LoanDataDto.Fields.typeAloanAmount,
				DossierDataDto.Fields.loanData + ObjectUtils.PROPERTY_NAME_SEPARATOR
						+ LoanDataDto.Fields.typeBloanAmount,
				DossierDataDto.Fields.loanData + ObjectUtils.PROPERTY_NAME_SEPARATOR
						+ LoanDataDto.Fields.additionalCredit,
				DossierDataDto.Fields.loanData + ObjectUtils.PROPERTY_NAME_SEPARATOR
						+ LoanDataDto.Fields.deadlineNumber,
				DossierDataDto.Fields.loanData + ObjectUtils.PROPERTY_NAME_SEPARATOR + LoanDataDto.Fields.rate,

				DossierDataDto.Fields.loanData + ObjectUtils.PROPERTY_NAME_SEPARATOR + LoanDataDto.Fields.requestedNotaryFee,
				DossierDataDto.Fields.loanData + ObjectUtils.PROPERTY_NAME_SEPARATOR + LoanDataDto.Fields.subsidizedCreditAmount,
				DossierDataDto.Fields.loanData + ObjectUtils.PROPERTY_NAME_SEPARATOR + LoanDataDto.Fields.bonusCreditAmount,
				DossierDataDto.Fields.loanData + ObjectUtils.PROPERTY_NAME_SEPARATOR + LoanDataDto.Fields.suportedCreditAmount,

				DossierDataDto.Fields.loanData + ObjectUtils.PROPERTY_NAME_SEPARATOR + LoanDataDto.Fields.subsidizedCreditDuration,
				DossierDataDto.Fields.loanData + ObjectUtils.PROPERTY_NAME_SEPARATOR + LoanDataDto.Fields.bonusCreditDuration,
				DossierDataDto.Fields.loanData + ObjectUtils.PROPERTY_NAME_SEPARATOR + LoanDataDto.Fields.suportedCreditDuration,

				DossierDataDto.Fields.loanData + ObjectUtils.PROPERTY_NAME_SEPARATOR + LoanDataDto.Fields.subsidizedCreditRate,
				DossierDataDto.Fields.loanData + ObjectUtils.PROPERTY_NAME_SEPARATOR + LoanDataDto.Fields.bonusCreditRate,
				DossierDataDto.Fields.loanData + ObjectUtils.PROPERTY_NAME_SEPARATOR + LoanDataDto.Fields.suportedCreditRate,

				DossierDataDto.Fields.loanData + ObjectUtils.PROPERTY_NAME_SEPARATOR + LoanDataDto.Fields.typeAloanRate,
				DossierDataDto.Fields.loanData + ObjectUtils.PROPERTY_NAME_SEPARATOR + LoanDataDto.Fields.typeBloanRate,
				DossierDataDto.Fields.loanData + ObjectUtils.PROPERTY_NAME_SEPARATOR + LoanDataDto.Fields.additionalCreditRate,


				DossierDataDto.Fields.loanData + ObjectUtils.PROPERTY_NAME_SEPARATOR + LoanDataDto.Fields.typeAloanDuration,
				DossierDataDto.Fields.loanData + ObjectUtils.PROPERTY_NAME_SEPARATOR + LoanDataDto.Fields.typeBloanDuration,
				DossierDataDto.Fields.loanData + ObjectUtils.PROPERTY_NAME_SEPARATOR + LoanDataDto.Fields.additionalLoanDuration,

				DossierDataDto.Fields.loanData + ObjectUtils.PROPERTY_NAME_SEPARATOR + LoanDataDto.Fields.applicationFee,
				DossierDataDto.Fields.loanData + ObjectUtils.PROPERTY_NAME_SEPARATOR + LoanDataDto.Fields.cappedRate,
				DossierDataDto.Fields.loanData + ObjectUtils.PROPERTY_NAME_SEPARATOR + LoanDataDto.Fields.rateType
						+ ObjectUtils.PROPERTY_NAME_SEPARATOR + CodeLabelDto.Fields.code,
				DossierDataDto.Fields.loanData + ObjectUtils.PROPERTY_NAME_SEPARATOR + LoanDataDto.Fields.delayType
						+ ObjectUtils.PROPERTY_NAME_SEPARATOR + CodeLabelDto.Fields.code,
				DossierDataDto.Fields.loanData + ObjectUtils.PROPERTY_NAME_SEPARATOR + LoanDataDto.Fields.delayType
						+ ObjectUtils.PROPERTY_NAME_SEPARATOR + CodeLabelDto.Fields.designation,
				DossierDataDto.Fields.loanData + ObjectUtils.PROPERTY_NAME_SEPARATOR + LoanDataDto.Fields.delayed,
				DossierDataDto.Fields.loanData + ObjectUtils.PROPERTY_NAME_SEPARATOR + LoanDataDto.Fields.delayDuration,
				DossierDataDto.Fields.loanData + ObjectUtils.PROPERTY_NAME_SEPARATOR + LoanDataDto.Fields.acquisitionFee,
				DossierDataDto.Fields.insuranceData + ObjectUtils.PROPERTY_NAME_SEPARATOR
						+ InsuranceDataDto.Fields.insuranceCoefficient,
				DossierDataDto.Fields.insuranceData + ObjectUtils.PROPERTY_NAME_SEPARATOR
						+ InsuranceDataDto.Fields.promotionalInsuranceRate,
				DossierDataDto.Fields.insuranceData + ObjectUtils.PROPERTY_NAME_SEPARATOR
						+ InsuranceDataDto.Fields.insuredPercentage,

				DossierDataDto.Fields.insuranceData + ObjectUtils.PROPERTY_NAME_SEPARATOR
						+ InsuranceDataDto.Fields.subsidizedInsuranceCoefficient,
				DossierDataDto.Fields.insuranceData + ObjectUtils.PROPERTY_NAME_SEPARATOR
						+ InsuranceDataDto.Fields.subsidizedPromotionalInsuranceRate,
				DossierDataDto.Fields.insuranceData + ObjectUtils.PROPERTY_NAME_SEPARATOR
						+ InsuranceDataDto.Fields.subsidizedInsuredPercentage,

				DossierDataDto.Fields.insuranceData + ObjectUtils.PROPERTY_NAME_SEPARATOR
						+ InsuranceDataDto.Fields.bonusInsuranceCoefficient,
				DossierDataDto.Fields.insuranceData + ObjectUtils.PROPERTY_NAME_SEPARATOR
						+ InsuranceDataDto.Fields.bonusPromotionalInsuranceRate,
				DossierDataDto.Fields.insuranceData + ObjectUtils.PROPERTY_NAME_SEPARATOR
						+ InsuranceDataDto.Fields.bonusInsuredPercentage,

				DossierDataDto.Fields.insuranceData + ObjectUtils.PROPERTY_NAME_SEPARATOR
						+ InsuranceDataDto.Fields.suportedInsuranceCoefficient,
				DossierDataDto.Fields.insuranceData + ObjectUtils.PROPERTY_NAME_SEPARATOR
						+ InsuranceDataDto.Fields.suportedPromotionalInsuranceRate,
				DossierDataDto.Fields.insuranceData + ObjectUtils.PROPERTY_NAME_SEPARATOR
						+ InsuranceDataDto.Fields.suportedInsuredPercentage,

				DossierDataDto.Fields.insuranceData + ObjectUtils.PROPERTY_NAME_SEPARATOR
						+ InsuranceDataDto.Fields.typeAInsuranceCoefficient,
				DossierDataDto.Fields.insuranceData + ObjectUtils.PROPERTY_NAME_SEPARATOR
						+ InsuranceDataDto.Fields.typeAPromotionalInsuranceRate,
				DossierDataDto.Fields.insuranceData + ObjectUtils.PROPERTY_NAME_SEPARATOR
						+ InsuranceDataDto.Fields.typeAInsuredPercentage,

				DossierDataDto.Fields.insuranceData + ObjectUtils.PROPERTY_NAME_SEPARATOR
						+ InsuranceDataDto.Fields.typeBInsuranceCoefficient,
				DossierDataDto.Fields.insuranceData + ObjectUtils.PROPERTY_NAME_SEPARATOR
						+ InsuranceDataDto.Fields.typeBPromotionalInsuranceRate,
				DossierDataDto.Fields.insuranceData + ObjectUtils.PROPERTY_NAME_SEPARATOR
						+ InsuranceDataDto.Fields.typeBInsuredPercentage,

				DossierDataDto.Fields.insuranceData + ObjectUtils.PROPERTY_NAME_SEPARATOR
						+ InsuranceDataDto.Fields.aditionalCreditInsuranceCoefficient,
				DossierDataDto.Fields.insuranceData + ObjectUtils.PROPERTY_NAME_SEPARATOR
						+ InsuranceDataDto.Fields.aditionalCreditPromotionalInsuranceRate,
				DossierDataDto.Fields.insuranceData + ObjectUtils.PROPERTY_NAME_SEPARATOR
						+ InsuranceDataDto.Fields.aditionalCreditInsuredPercentage,

				DossierDataDto.Fields.warranties);

		PATCHED_FIELDS_BY_STATUS_CODE = new HashMap<>();
		PATCHED_FIELDS_BY_STATUS_CODE.put(DossierStatus.ADDITIONAL_AGENCY_INFORMATION_DECISION.getCode(), fields);
		PATCHED_FIELDS_BY_STATUS_CODE.put(DossierStatus.DECS_RIDN.getCode(), fields);
		PATCHED_FIELDS_BY_STATUS_CODE.put(DossierStatus.AGREEMENT_RISK_ANALIST_RETAIL_RIDN.getCode(), fields);
		PATCHED_FIELDS_BY_STATUS_CODE.put(DossierStatus.DECISION_RISK_FINAL_RIND.getCode(), fields);
		PATCHED_FIELDS_BY_STATUS_CODE.put(DossierStatus.AGREEMENT_RISK_RIDN.getCode(), fields);
		PATCHED_FIELDS_BY_STATUS_CODE.put(DossierStatus.INFO_COMP_AGENCY_ANALIST_RETAIL.getCode(), fields);
		PATCHED_FIELDS_BY_STATUS_CODE.put(DossierStatus.INCA_AVRS_RANR.getCode(), fields);
		PATCHED_FIELDS_BY_STATUS_CODE.put(DossierStatus.INFO_COMP_DECS_RISK.getCode(), fields);
		PATCHED_FIELDS_BY_STATUS_CODE.put(DossierStatus.INFO_COMP_AGREEMENT_RISK.getCode(), fields);
		PATCHED_FIELDS_BY_STATUS_CODE.put(DossierStatus.DECISION_RISK_RIND.getCode(), fields);
		PATCHED_FIELDS_BY_STATUS_CODE.put(DossierStatus.DECISION_RISK.getCode(), fields);

		PATCHED_FIELDS_BY_STATUS_CODE.put(DossierStatus.OPC_VALIDATED.getCode(), Arrays.asList(
				DossierDataDto.Fields.uuid, DossierDataDto.Fields.opcDeliveryDate));
	}

	@Value("${dossier.demand.retry-per-status:1}")
	private int maxRetry;
	@Value("${loan.intern.tva:10}")
	private String tva;

	@Value("${application.api.omnicanal.services.product.loan.credit-bureau.user-header:}")
	private String usernameHeader;

	@Autowired
	private ValidationService<DossierDataDto> validationService;
	@Autowired
	private ReferentialService referentialService;
	@Autowired
	private AttachmentService attachmentService;
	@Autowired
	private DossierDataClient dossierDataClient;
	@Autowired
	private PPWorkflowService ppWorkflowService;
	@Autowired
	private CustomerService customerService;
	@Autowired
	private DossierDataDtoMapper dossierDataDtoMapper;
	@Autowired
	private MessageService messageService;
	@Autowired
	private DossierUserDtoMapper dossierUserDtoMapper;
	@Autowired
	private ApplicationContext applicationContext;
	@Autowired
	private NotificationGeneratorService notificationService;
	@Autowired
	private OpcGeneratorService opcGeneratorService;
	@Autowired
	private DossierDataHelper dossierDataHelper;
	@Autowired
	private ReassignmentRequestMapper reassignmentRequestMapper;
	@Autowired
	private DossierAttachmentTypeService dossierAttachmentTypeService;
	@Autowired
	private UserService userService;
	@Autowired
	private DossierRequestMapper dossierRequestMapper;
	@Autowired
	private UserDtoMapper userDtoMapper;
	@Autowired
	private NotifyStrategyFactory notifyStrategyFactory;
	@Autowired
	private CcgCommissionService ccgCommissionService;
	@Autowired
	private CreditBureauClient creditBureauClient;
	@Autowired
	private CreditBureauService creditBureauService;


	@Value("${application.cards.blue.product.codes:PCK70007,PCK70008,PCK70009,PCK70010}")
	private String[] blueCardProductCodes;

	@Autowired
	private  ContractPackClient contractPackClient;


	@Override
	@Auditable(actionType = AuditActionType.CREATION, objectClass = AuditableObject.DOSSIER_DATA)
	public DossierDataDto createDossier(DossierDataDto dossierDataDto) {

        controlDossier(dossierDataDto, false);
        completeDossier(dossierDataDto);
        updateCustomerMarket(dossierDataDto);

        DossierDataCoreDto dossierDataCoreDto = dossierDataDtoMapper.convertToCoreDTO(dossierDataDto);

        dossierDataHelper.fillDossierUser(dossierDataCoreDto, Role.INITIATOR, UserHelper.getCurrentUser());

        DossierDataCoreDto createdDossierDataDto = saveDossier(dossierDataCoreDto);
        AuditContextHolder.setObjectId(createdDossierDataDto.getUuid());

        startLoanProcess(createdDossierDataDto.getUuid());

        return dossierDataDtoMapper.convertToApiDTO(createdDossierDataDto);
    }

	private void updateCustomerMarket(DossierDataDto dossierDataDto) {
		if(dossierDataDto == null  || dossierDataDto.getCustomerData()==null || dossierDataDto.getCustomerData().getPersonalInfo()==null ) return;
		PersonalInfoDTO personalInfo = dossierDataDto.getCustomerData().getPersonalInfo();
		if ((personalInfo.getSegment()!=null && MCH_09.equals(personalInfo.getMarket())) || (!"MAROC".equals(personalInfo.getCountry()) && Objects.nonNull(personalInfo.getMarket()) && personalInfo.getMarket().startsWith(MCH_01) ) ) {
				setCustomerMarket(dossierDataDto.getEmployer(), personalInfo);
		}
	}

	private  void setCustomerMarket(EmployerDto employerDto, PersonalInfoDTO personalInfo){
		String country= personalInfo.getCountry();
		String market=personalInfo.getMarket();
		String customerType=employerDto.getCutomerType();
		if (isCustomerMre(country,market)){
			setMarketBaseOnCustomerType(customerType,personalInfo,MCH_01_PRI,MCH_01_PRO);
		}else {
			setMarketBySegement(personalInfo,employerDto);
		}
	}

	private void setMarketBySegement(PersonalInfoDTO personalInfo, EmployerDto employerDto) {
		String customerType=employerDto.getCutomerType();
		if (personalInfo.getSegment().contains(CLIENT_PRI)) {
			personalInfo.setMarket(MCH_09_PRI);
		} else if (personalInfo.getSegment().contains(CLIENT_PRO)) {
			personalInfo.setMarket(MCH_09_PRO);
		} else if (!StringUtils.isEmpty(customerType)){
			setMarketBaseOnCustomerType(customerType,personalInfo,MCH_09_PRI,MCH_09_PRO);
		}
	}
	private void setMarketBaseOnCustomerType(String customerType, PersonalInfoDTO personalInfo, String clientPriMarket, String clientPrOMarket) {
		if (!StringUtils.isEmpty(customerType)) {
			if (CLIENT_PRI.equals(customerType)) {
				personalInfo.setMarket(clientPriMarket);
			} else {
				personalInfo.setMarket(clientPrOMarket);
			}
		}
	}
	private boolean isCustomerMre(String country, String market) {
		return !"MAROC".equals(country) && market.startsWith(MCH_01);
	}

	@Override
	@Auditable(actionType = AuditActionType.MODIFICATION, objectClass = AuditableObject.DOSSIER_DATA)
	public DossierDataDto updateDossier(DossierDataDto dossierDataDto) {
		AuditContextHolder.setObjectId(dossierDataDto.getUuid());
		DossierDataCoreDto oldDossier = dossierDataClient.retrieveByUuid(dossierDataDto.getUuid());
		return updateDossier(dossierDataDto, oldDossier.getCodeStatus());
	}

	@Override
	@Auditable(actionType = AuditActionType.MODIFICATION, objectClass = AuditableObject.DOSSIER_DATA)
	public DossierDataDto patchDossier(DossierDataDto dossierDataDto) {
		AuditContextHolder.setObjectId(dossierDataDto.getUuid());
		DossierDataDto oldDossier = retrieveByUuid(dossierDataDto.getUuid());
		Assert.contains(Arrays.asList(
				DossierStatus.ADDITIONAL_AGENCY_INFORMATION_DECISION.getCode(),
				DossierStatus.DECS_RIDN.getCode(),
				DossierStatus.AGREEMENT_RISK_ANALIST_RETAIL_RIDN.getCode(),
				DossierStatus.DECISION_RISK_FINAL_RIND.getCode(),
				DossierStatus.AGREEMENT_RISK_RIDN.getCode(),
				DossierStatus.DECISION_RISK_RIND.getCode(),
				DossierStatus.DECISION_RISK.getCode(),
				DossierStatus.INFO_COMP_AGENCY_ANALIST_RETAIL.getCode(),
				DossierStatus.INCA_AVRS_RANR.getCode(),
				DossierStatus.INFO_COMP_AGREEMENT_RISK.getCode(),
				DossierStatus.INFO_COMP_DECS_RISK.getCode()),
				oldDossier.getCodeStatus(), messageService.getMessage(API_ACTION_NOT_ALLOWED));
		List<String> nonNullProperties = ObjectUtils.getNonNullPropertyNames(dossierDataDto);
		nonNullProperties.removeIf(item -> item.endsWith("Valid") || item.endsWith("empty"));
		Assert.True(PATCHED_FIELDS_BY_STATUS_CODE.get(oldDossier.getCodeStatus()).containsAll(nonNullProperties),
				messageService.getMessage(API_ACTION_NOT_ALLOWED));

		ObjectUtils.copySelectedProperties(dossierDataDto, oldDossier, nonNullProperties);
		if (nonNullProperties
				.contains(DossierDataDto.Fields.loanData + ObjectUtils.PROPERTY_NAME_SEPARATOR
						+ LoanDataDto.Fields.claimedAmountOfPurchase)
				|| nonNullProperties.contains(DossierDataDto.Fields.loanData + ObjectUtils.PROPERTY_NAME_SEPARATOR
				+ LoanDataDto.Fields.claimedAmountOfBuildDevelopment)) {
			recalculateLoanAmounts(oldDossier);
		}
		if (nonNullProperties.contains(DossierDataDto.Fields.loanData + ObjectUtils.PROPERTY_NAME_SEPARATOR
				+ LoanDataDto.Fields.rateType + ObjectUtils.PROPERTY_NAME_SEPARATOR + CodeLabelDto.Fields.code)) {
			recalculateRates(oldDossier);
		}

		Boolean isDelayed = dossierDataDto.getLoanData().getDelayed();
		if (Boolean.FALSE.equals(isDelayed) &&
				Arrays.asList(DossierStatus.ADDITIONAL_AGENCY_INFORMATION_DECISION.getCode(), DossierStatus.DECS_RIDN.getCode(),
						DossierStatus.AGREEMENT_RISK_ANALIST_RETAIL_RIDN.getCode(), DossierStatus.AGREEMENT_RISK_RIDN.getCode(),
						DossierStatus.INFO_COMP_AGENCY_ANALIST_RETAIL.getCode(), DossierStatus.DECISION_RISK_FINAL_RIND.getCode(),
						DossierStatus.DECISION_RISK_RIND.getCode(),DossierStatus.DECISION_RISK.getCode()).contains(oldDossier.getCodeStatus()) ){
			dossierDataHelper.purgeDossierDelayedFields(oldDossier);
		}

		return updateDossier(oldDossier, oldDossier.getCodeStatus());
	}

	@Override
	@Auditable(actionType = AuditActionType.CREATION, objectClass = AuditableObject.DOSSIER_ATTACHMENT_TYPE)
	public List<DossierAttachmentTypeDto> createDossierAttachmentTypes(DossierDataCoreDto dossierDto,String prospectUuid) {
		AuditContextHolder.setComment(DOSSIER_DATA_UUID + dossierDto.getUuid());
		List<RefAttachmentTypeDto> refAttachmentTypes = referentialService.getAllAttachmentTypes(Platform.PP)
				.stream()
				.filter(item -> isAttachmentTypeValid(item, dossierDto))
				.toList();

		if (refAttachmentTypes.isEmpty()) {
			return Collections.emptyList();
		}

		RefAttachmentTypesCodesDto typesCodesDto = RefAttachmentTypesCodesDto.builder()
				.refAttachmentTypesCodes(refAttachmentTypes.stream().map(RefAttachmentTypeDto::getCode).toList())
				.oldDossierUuid(prospectUuid)
				.build();

		return dossierDataClient.createDossierAttachmentTypes(dossierDto.getUuid(), typesCodesDto);
	}

	private Map<String, RefAttachmentTypeStatusDto> getAttachmentTypeStatusMap(String codeStatus) {
		List<RefAttachmentTypeStatusDto> allRefAttachmentTypesByStatus = referentialService.getAllRefAttachmentTypesByStatus(codeStatus);
		return ObjectUtils.createMapFromList(allRefAttachmentTypesByStatus, dto -> dto.getAttachmentType() != null ? dto.getAttachmentType().getCode() : null);
	}

	private boolean isValidAttachmentType(DossierAttachmentTypeDto dat, String codeStatus) {
		boolean isInit = Arrays.asList( DossierStatus.INITIATION.getCode(), DossierStatus.ADDITIONAL_AGENCY_INFORMATION_VALIDATION.getCode())
				.contains(codeStatus);
		List<String> restrictedTypes = Arrays.asList("OPC", "CERTIFICATE_PROPRIETE", DEMANDE_EXPETISE_SIGNED, "RAPPORT_EXPETISE", DEMANDE_EXPETISE);
		return !(isInit && restrictedTypes.contains(dat.getCodeRefAttachmentType()));
	}

	@Override
	@Auditable(actionType = AuditActionType.CONSULTATION, objectClass = AuditableObject.DOSSIER_ATTACHMENT_TYPE)
	public List<DossierAttachmentTypeDto> getDossierAttachmentTypes(String uuid) {
		AuditContextHolder.setComment("DossierData: " + uuid);
		DossierDataCoreDto dossier = dossierDataClient.retrieveByUuid(uuid);
		Assert.notNull(dossier, messageService.getMessage(API_ACTION_NOT_ALLOWED));
		String codeStatus = dossier.getCodeStatus();
		Map<String, RefAttachmentTypeStatusDto> mapAttachmentTypeStatus = getAttachmentTypeStatusMap(codeStatus);

        return dossierAttachmentTypeService.getAttachmentTypesByIntervention(uuid).stream()
                .filter(dat -> isValidAttachmentType(dat, codeStatus))
                .map(dto->{
                    dto.setVisibility(isAttachmentTypeValid(RefAttachmentTypeDto.builder().rules(
                            mapAttachmentTypeStatus.getOrDefault(dto.getCodeRefAttachmentType(), new RefAttachmentTypeStatusDto()).getRules()).build(), dossier));
                    dto.setMandatory(checkAttachmentTypeIsMandatory(dto.getCodeRefAttachmentType(),dossier, mapAttachmentTypeStatus,codeStatus));
                    return dto;
                }).collect(Collectors.toList());
	}

	@Override
	@Auditable(actionType = AuditActionType.SEND_TO_VALIDATION, objectClass = AuditableObject.DOSSIER_DATA)
	public DossierDataDto validateStatmentTask(String uuid, ValidateStatementDto validateStatementDto) throws Exception {
		AuditContextHolder.setObjectId(uuid);
		DossierDataCoreDto dossier = dossierDataClient.retrieveByUuid(uuid);
		return this.advanceDossier(dossier,
				WorkflowTaskCompletionDto.builder()
						.comment(validateStatementDto.getComment()).object(validateStatementDto.getValidator()).build());
	}

	@Override
	@Auditable(actionType = AuditActionType.SEND_TO_DSC_DELIVERY_MANAGER, objectClass = AuditableObject.DOSSIER_DATA)
	public DossierDataDto sendToDeliveryManager(String uuid, ForwardToDSCDto forwardToDSCDto) throws Exception {
		DossierDataCoreDto dossier = dossierDataClient.retrieveByUuid(uuid);
		dossier.setHasTaskExpertise(forwardToDSCDto.getSendToExpertiseReview());
		dossierDataClient.update(uuid, dossier);
		return this.advanceDossier(dossier, WorkflowTaskCompletionDto.builder()
				.operationResult(WorkflowValidationResult.VALID).comment(forwardToDSCDto.getComment())
				.object(forwardToDSCDto).build());

	}

	@Override
	@Auditable(actionType = AuditActionType.REQUEST_ADDITIONAL_INFORMATION, objectClass = AuditableObject.DOSSIER_DATA)
	public DossierDataDto returnDossierToAgency(String uuid, CommentDto comment) throws Exception {
		DossierDataCoreDto dossier = dossierDataClient.retrieveByUuid(uuid);
		return this.advanceDossier(dossier, WorkflowTaskCompletionDto.builder()
				.operationResult(WorkflowValidationResult.MORE_INFO).comment(comment).build());
	}

	@Override
	@Auditable(actionType = AuditActionType.RESPONSE_ADDITIONAL_INFORMATION, objectClass = AuditableObject.DOSSIER_DATA)
	public DossierDataDto additionalInfoFeedback(String uuid, CommentDto comment) throws Exception {
		DossierDataCoreDto dossier = dossierDataClient.retrieveByUuid(uuid);
		return this.advanceDossier(dossier, WorkflowTaskCompletionDto.builder().operationResult(WorkflowValidationResult.OK).comment(comment).build());
	}

	@Override
	@Auditable(actionType = AuditActionType.SEND_TO_DECISION, objectClass = AuditableObject.DOSSIER_DATA)
	public DossierDataDto sendToDecisionAuthority(String uuid, DecisionDto decisionDto) throws Exception {
		DossierDataCoreDto dossier = dossierDataClient.retrieveByUuid(uuid);
		return this.advanceDossier(dossier,
				WorkflowTaskCompletionDto.builder().operationResult(WorkflowValidationResult.VALID)
						.comment(decisionDto.getComment()).object(decisionDto.getDecisionAuthority()).build());
	}

	@Override
	@Auditable(actionType = AuditActionType.CANCELATION, objectClass = AuditableObject.DOSSIER_DATA)
	public DossierDataDto abortDossier(String uuid, CommentDto comment) {
		AuditContextHolder.setObjectId(uuid);
		DossierDataCoreDto dossier = dossierDataClient.retrieveByUuid(uuid);
		Assert.notContains(dossier.getCodeStatus(), DossierStatus.ABORTED.getCode(),
				messageService.getMessage(MessageKeyConstants.API_ACTION_NOT_ALLOWED_STATUS_NOT_VALID));
		TaskResult task = getCurrentUserTask(dossier.getUuid());
		Assert.notNull(task, messageService.getMessage(API_ACTION_NOT_ALLOWED));
		dossierDataHelper.purgeNonUpdatableDossierFields(dossier);
		dossierDataHelper.fillComment(comment, dossier, CommentType.ABANDONMENT_REASON);
		RefStageDto refStageDto = referentialService.getStatusByCode(dossier.getCodeStatus())
				.map(RefStatusDto::getStage)
				.orElse(null);
		String phaseCode = refStageDto != null ? refStageDto.getCode() : null;
		dossier.setCodeStatus(DossierStatus.ABORTED.getCode() + "_" + phaseCode);
		DossierDataCoreDto dossierDataDto = dossierDataClient.update(dossier.getUuid(), dossier);
		return dossierDataDtoMapper.convertToApiDTO(dossierDataDto);
	}

	@Override
	@Auditable(actionType = AuditActionType.REJECTION, objectClass = AuditableObject.DOSSIER_DATA)
	public DossierDataDto rejectDossier(String uuid, CommentDto comment) throws Exception {
		DossierDataCoreDto dossier = dossierDataClient.retrieveByUuid(uuid);
		return this.advanceDossier(dossier, WorkflowTaskCompletionDto.builder()
				.operationResult(WorkflowValidationResult.INVALID).comment(comment).build());
	}

	@Override
	@Auditable(actionType = AuditActionType.ACCEPTANCE, objectClass = AuditableObject.DOSSIER_DATA)
	public DossierDataDto approveDossier(String uuid) throws Exception {
		DossierDataCoreDto dossier = dossierDataClient.retrieveByUuid(uuid);
		return this.advanceDossier(dossier,
				WorkflowTaskCompletionDto.builder()
						.operationResult(WorkflowValidationResult.VALID)
						.build());
	}

	/**
	 * The purpose of this endpoint is to approve/re-approve the dossier after return
	 * decision and accept or reject request {demand}
	 * @param uuid dossier
	 * @return Dossier data dto
	 */
	@Override
	@Auditable(actionType = AuditActionType.ACCEPTANCE, objectClass = AuditableObject.DOSSIER_DATA)
	public DossierDataDto approveDossier(String uuid,RequestStatus flag) throws Exception {
		DossierDataCoreDto dossier = dossierDataClient.retrieveByUuid(uuid);
		return this.advanceDossier(dossier,
				WorkflowTaskCompletionDto.builder()
						.operationResult(WorkflowValidationResult.VALID)
						.object(flag)
						.build());
	}

	@Override
	public BigDecimal calculateLoanAmount(LoanDataDto loanData) {
		BigDecimal result = ZERO;
		if (loanData != null) {
			result = result.add(NumberUtils.nonNullBigDecimal(loanData.getClaimedAmountOfBuildDevelopment()));
			result = result.add(NumberUtils.nonNullBigDecimal(loanData.getClaimedAmountOfPurchase()));
			result = result.add(NumberUtils.nonNullBigDecimal(loanData.getRequestedNotaryFee()));
		}
		return NumberUtils.stripTrailingZeros(result);
	}

	@Override
	public BigDecimal calculateApport(LoanDataDto loanData) {
		BigDecimal result = ZERO;
		if (loanData != null) {
			result = result.add(NumberUtils.nonNullBigDecimal(loanData.getInvestmentAmount()));
			result = result.subtract(NumberUtils.nonNullBigDecimal(loanData.getLoanAmount()));
		}
		return NumberUtils.stripTrailingZeros(result);
	}

	@Override
	public BigDecimal calculateInvestmentAmount(LoanDataDto loanData) {
		BigDecimal result = ZERO;
		if (loanData != null) {
			result = result.add(NumberUtils.nonNullBigDecimal(loanData.getAcquisitionPrice()));
			result = result.add(NumberUtils.nonNullBigDecimal(loanData.getAcquisitionFee()));
			result = result.add(NumberUtils.nonNullBigDecimal(loanData.getBuildDevelopmentQuotation()));
		}
		return NumberUtils.stripTrailingZeros(result);
	}

    @Override
    public BigDecimal calculatePercentOfApport(LoanDataDto loanData) {
        if (loanData == null || loanData.getInvestmentAmount() == null || ZERO.equals(loanData.getInvestmentAmount())) {
            return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        }

        BigDecimal apport = NumberUtils.nonNullBigDecimal(loanData.getApport());
        BigDecimal investment = NumberUtils.nonNullBigDecimal(loanData.getInvestmentAmount());

        return apport.multiply(BigDecimal.valueOf(100)).divide(investment, 2, RoundingMode.HALF_UP);
    }

    @Override
	public BigDecimal calculateApplicationFee(LoanDataDto loanData) {
		return dossierDataHelper.calculateApplicationFee(loanData);
	}


	@Override
	@Auditable(actionType = AuditActionType.CONSULTATION, objectClass = AuditableObject.DOSSIER_DATA)
	public DossierDataDto retrieveByUuid(String uuid) {
		log.info("Start retrieving dossier: {}", uuid);
		AuditContextHolder.setObjectId(uuid);
		DossierDataCoreDto dto = dossierDataClient.retrieveByUuid(uuid);
		List<DossierReturnDecisionDto> retries = dto.getDossierReturnDecisions();
		DossierDataDto dossierDataDto = dossierDataDtoMapper.convertToApiDTO(dto);
		log.info("Dossier is retrieved: {}", dossierDataDto.getCodeStatus());
		dossierDataDto.setReturnDecisionInstance(isRetriesReturnDecisionInstance(retries,dossierDataDto.getCodeStage()));

		TaskResult taskResult = ppWorkflowService.getCurrentTask(null, uuid);

		if(taskResult != null){
			dossierDataDto.setAssignee(taskResult.getAssignee());
			dossierDataDto.setAssignedToMe(taskResult.getAssignee() != null && taskResult.getAssignee().equals(UserHelper.getCurrentUser().getIdentifier()));
			setPoolCandidate(dossierDataDto,taskResult);
			setTaskStatus(dossierDataDto,taskResult,dto.getDossierAttachmentTypes());
		}
		return dossierDataDto;
	}

	private void setTaskStatus(DossierDataDto dossierDataDto, TaskResult taskResult, List<DossierAttachmentTypeDto> dossierAttachmentTypes) {
		if (dossierDataDto == null || taskResult == null) {
			return;
		}
		Map<String, String> taskStatusMap = Stream.of(
				new AbstractMap.SimpleEntry<>("request_expertise", "REXP"),
				new AbstractMap.SimpleEntry<>("expertise_shipment", "EXPS"),
				new AbstractMap.SimpleEntry<>("exportise_rapport_shipment", "REXPR")
		).collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));

		String taskStatus = taskStatusMap.getOrDefault(taskResult.getActivityName(), dossierDataDto.getCodeStatus());

		if ("additional_info_feedback".equals(taskResult.getActivityName())
				&& "YES".equals(taskResult.getVariables().get("neededRequestExpertise"))) {

			boolean hasDemandeExpertiseAttachment = dossierAttachmentTypes.stream()
					.filter(dto -> dto.getAttachments() != null)
					.flatMap(dto -> dto.getAttachments().stream())
					.anyMatch(dat -> DEMANDE_EXPETISE.equals(dat.getAttachmentTypeCode()));

			taskStatus = hasDemandeExpertiseAttachment ? INCA_EXPS :INCA_EXP;
		}
		dossierDataDto.setTaskStatus(taskStatus);
	}


	@Override
	@Auditable(actionType = AuditActionType.UPLOAD, objectClass = AuditableObject.ATTACHMENT)
	public AttachmentDto uploadDocument(MultipartFile file, String dossierUuid, String attachmentTypeCode){
		AuditContextHolder
				.setComment(DOSSIER_DATA_UUID + dossierUuid + ", attachmentType code: " + attachmentTypeCode);
        AttachmentDto attachmentDto = null;
        try {
            attachmentDto = attachmentService.upload(file, dossierUuid, attachmentTypeCode);
        } catch (Exception e) {
			log.error("Cannot upload document of dossier: {} ", dossierUuid, e);
			throw new TechnicalException("Cannot upload document of dossier " + dossierUuid);
        }
        AuditContextHolder.setObjectId(attachmentDto.getUuid());
		return attachmentDto;
	}

	@Override
	@Auditable(actionType = AuditActionType.DOWNLOAD, objectClass = AuditableObject.ATTACHMENT)
	public String downloadDocument(String uuid, String dossierAttachmentTypeUuid, String attachmentUuid) throws Exception {
		AuditContextHolder.setObjectId(uuid);
		return attachmentService.download(UUID.fromString(attachmentUuid));
	}

	@Override
	public DossierUserDto getDossierUserRoleByCode(String dossierUuid, String codeRole) {
		DossierDataCoreDto dossierDto = this.dossierDataClient.retrieveByUuid(dossierUuid);
		List<DossierUserCoreDto> duList = dossierDto.getDossierUsers().stream()
				.filter(du -> codeRole.equalsIgnoreCase(du.getCodeRole())).collect(Collectors.toList());
		if (!duList.isEmpty())
			return dossierUserDtoMapper.convertToApiDTO(duList.get(0));
		return null;
	}

	@Override
	@Auditable(actionType = AuditActionType.CONSULTATION, objectClass = AuditableObject.DOSSIER_DATA)
	public SearchResponse<KpiDossierData> getAll(SearchRequest<DossierDataCriteria> searchRequest) {
		AuditContextHolder.setComment(searchRequest.toString());
		searchRequest.setResultFormat(AbstractDossierData.SHORT_FORMAT);
		DossierListEnum listType = searchRequest.getSearchCriteria().getListType();
		List<TaskResult> userTasks = new ArrayList<>();
		SearchRequest<DossierDataCriteria> params = prepareQueryParams(searchRequest, userTasks);

		if(Arrays.asList(ALL_INPROGRESS_TASKS, ALL_RETURNED_TASKS).contains(listType) && CollectionUtils.isEmpty(params.getSearchCriteria().getInlistUuidDossier())) {
				return SearchResponse.emptyResponse();
		}

		log.info("Send search dossiers with pramas : {}", params);

		SearchResponse<KpiDossierData> userDossiers = dossierDataClient.searchDossierList(params);

		if (userDossiers == null || userDossiers.getResult() == null) {
			return SearchResponse.emptyResponse();
		}

		if(Arrays.asList(DossierListEnum.ALL_INPROGRESS_TASKS, DossierListEnum.ALL_RETURNED_TASKS).contains(listType)){
			dossierDataDtoMapper.mapPoolCandidates(userTasks, userDossiers.getResult());
		}
		return new SearchResponse<>(userDossiers.getResult(),
			userDossiers.getCurrentPage(),
			userDossiers.getTotalPages(),
			userDossiers.getNumberOfElementsPerPage(),
			userDossiers.getNumberOfElementsInPage(),
			userDossiers.getTotalElements());
	}

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
		dossier.setTaskStatus(getTaskStatus(task,dossier.getCodeStatus(),dossier.getDossierAttachmentTypes()));

		workflowTaskCompletion.execute(task, dossier, object);
		log.info("Task is completed and start updating dossier");
		dossierDataClient.update(dossier.getUuid(), dossier);
		log.info("End updating dossier");
		return retrieveByUuid(task.getCaseInstanceId());
	}

	private String getCodeStage(String codeStatus) {
		if (codeStatus != null) {
			RefStageDto refStageDto = referentialService.getStatusByCode(codeStatus)
					.map(RefStatusDto::getStage)
					.orElse(null);
			if (refStageDto != null) {
				return refStageDto.getCode();
			}
		}
		return null;
	}
	
	private ReleaseDossierDto getAmountToRelease(DossierDataCoreDto dossier, ReleaseDossierDto releaseDossierDto) {
		BigDecimal loanAmount = dossier.getLoanData().getLoanAmount();

		if(releaseDossierDto.isFullRelease()){
			releaseDossierDto.setAmountToRelease(loanAmount);
			return releaseDossierDto;
		}

		BigDecimal amountReleased = NumberUtils.nonNullBigDecimal(dossier.getLoanData().getAmountReleased());
		BigDecimal amountToRelease = amountReleased.add(NumberUtils.nonNullBigDecimal(releaseDossierDto.getAmountToRelease()));
		log.info("Loan amount be released : {}, releasedAmount :{}", amountToRelease, amountReleased);

		Assert.True(amountToRelease.compareTo(loanAmount) <= 0 && amountToRelease.compareTo(ZERO) > 0,
				messageService.getMessage(MessageKeyConstants.AMOUT_TO_RELEASE_MUST_BE_LESS_THAN_OR_EQUAL));

		releaseDossierDto.setFullRelease(releaseDossierDto.isFullRelease() || amountToRelease.compareTo(loanAmount) == 0);
		releaseDossierDto.setAmountToRelease(releaseDossierDto.isFullRelease() ? loanAmount : amountToRelease);

		return releaseDossierDto;
	}

	private String getTaskStatus(TaskResult taskResult, String codeStatus, List<DossierAttachmentTypeDto> dossierAttachmentTypes) {
		String taskStatus=codeStatus;
		if ("additional_info_feedback".equals(taskResult.getActivityName()) && "YES".equals(taskResult.getVariables().get("neededRequestExpertise"))){
			taskStatus=INCA_EXP;
			Optional<DossierAttachmentTypeDto> demandeExpetiseSigne = dossierAttachmentTypes.stream()
					.filter(dat -> DEMANDE_EXPETISE.equals(dat.getCodeRefAttachmentType()))
					.findFirst();
			if (demandeExpetiseSigne.isPresent() && Boolean.TRUE.equals(demandeExpetiseSigne.get().getCompleted())){
				taskStatus= INCA_EXPS;
			}
		}
		return taskStatus;
	}


	@Override
	@Auditable(actionType = AuditActionType.CONSULTATION, objectClass = AuditableObject.DOSSIER_ATTACHMENT_TYPE)
	public List<DossierAttachmentTypeDto> getDossierAttachmentTypesByStatus(String uuid, String taskStatus) {
		DossierDataCoreDto dossier = dossierDataClient.retrieveByUuid(uuid);
		if (dossier == null) throw new IllegalArgumentException(Errors.DOSSIER_SHOULD_NOT_BE_NULL);

		List<RefAttachmentTypeDto> rats = referentialService.getAllAttachmentTypes(Platform.PP);
		Map<String, RefAttachmentTypeDto> attachmentTypeMap = ObjectUtils.createMapFromList(rats, dto->dto.getCode());

		List<RefAttachmentTypeStatusDto> allRefAttachmentTypesByStatus = this.referentialService.getAllRefAttachmentTypesByStatus(dossier.getCodeStatus());
		Map<String, RefAttachmentTypeStatusDto> mapAttachmentTypeStatus = ObjectUtils.createMapFromList(
				allRefAttachmentTypesByStatus, dto->dto.getAttachmentType() != null ? dto.getAttachmentType().getCode() :null);

		return dossier.getDossierAttachmentTypes().stream()
			.filter(item ->filterAttachmentType(dossier, item.getCodeRefAttachmentType(),
					taskStatus,mapAttachmentTypeStatus))
			.map(dat -> Optional.ofNullable(attachmentTypeMap.get(dat.getCodeRefAttachmentType()))
				.map(att -> {
					dat.setRefAttachmentTypeDesignation(att.getDesignation());
					dat.setRefAttachmentTypeDescription(att.getDescription());
					dat.setRefAttachmentTypeOrder(att.getOrder());
					dat.setMandatory(checkAttachmentTypeIsMandatory( dat.getCodeRefAttachmentType(), dossier, mapAttachmentTypeStatus, taskStatus ));
					return dat; })
				.orElse(dat))
			.collect(Collectors.toList());
	}

	/**
	 * POP-128 generation de la notification du dossier : 1-génération d'une
	 * nouvelle version du document de la notification. 2-upload du document généré
	 * vers l'espace du stockage(MultipartFile). 3-changement du statut du dossier
	 * vers notif_generee. 4-retourner le dossier mis à jour avec la notification
	 * générée
	 */
	@Override
	@Auditable(actionType = AuditActionType.CREATION, objectClass = AuditableObject.DOSSIER_ATTACHMENT_TYPE)
	public DossierDataDto generateNotificationDossier(String uuid, NotificationGeneratorDto notificationGeneratorDto)
			throws Exception {

		AuditContextHolder.setObjectId(uuid);
		DossierDataCoreDto dossier = dossierDataClient.retrieveByUuid(uuid);
		Assert.contains(List.of(DossierStatus.DECS_RIDN.getCode(),
						DossierStatus.AGREEMENT_RISK_RIDN.getCode(),
						DossierStatus.AGREEMENT_RISK_ANALIST_RETAIL_RIDN.getCode(),
						DossierStatus.DECISION.getCode(),
						DossierStatus.AGREEMENT_RISK.getCode(),
						DossierStatus.DECISION_RISK.getCode(),
						DossierStatus.AGREEMENT_RISK_ANALIST_RETAIL.getCode(),
						DossierStatus.DECS_RS_RIND.getCode(),
						DossierStatus.DECISION_RISK_FINAL_RIND.getCode()), dossier.getCodeStatus(),
				messageService.getMessage(MessageKeyConstants.API_ACTION_NOT_ALLOWED_STATUS_NOT_VALID));
		if (notificationGeneratorDto.getRestrictions() != null && !notificationGeneratorDto.getRestrictions().isEmpty()) {
			dossier.setRestrictions(notificationGeneratorDto.getRestrictions());
		} else {
			dossier.setRestrictions(Collections.emptyList());
		}

		if (notificationGeneratorDto.getWarranties() != null && !notificationGeneratorDto.getWarranties().isEmpty()) {
			dossier.setWarranties(notificationGeneratorDto.getWarranties());
		}
		if (AccordType.PRINCIPE.equals(dossier.getAccord()) && hasAttachment(dossier, ATTACHMENT_TYPE_NOTIFICATION)) {
			dossier.setAccord(AccordType.DEFINITIF);
		}
		DossierDataDto dossierDataDto = dossierDataDtoMapper.convertToApiDTO(dossier);
		byte[] notificationAsBytes = notificationService.generateNotification(dossierDataDto, notificationGeneratorDto);

		String notificationFilename = this.generateNotification(dossierDataDto);
		MultipartFile notificationMultipartFile = new BASE64DecodedMultipartFile(notificationAsBytes, notificationFilename, notificationFilename);
		AttachmentDto attachmentDto = this.uploadDocument(notificationMultipartFile, uuid, ATTACHMENT_TYPE_NOTIFICATION);
		if(attachmentDto.getUuid() != null){
			dossier.getWarranties().forEach(w-> w.setAttachment(attachmentDto));
			dossier.getRestrictions().forEach(r-> r.setAttachment(attachmentDto));
			dossierDataDto = this.updateDossierPreGeneration(dossier);
		}

		DossierAttachmentTypeDto dossierAttachmentTypeDto = new DossierAttachmentTypeDto();
		dossierAttachmentTypeDto.setAttachments(Collections.singletonList(attachmentDto));
		dossierAttachmentTypeDto.setCompleted(true);
		dossierDataDto.getDossierAttachmentTypes().add(dossierAttachmentTypeDto);

		return dossierDataDto;
	}
	@Override
	@Auditable(actionType = AuditActionType.CREATION, objectClass = AuditableObject.DOSSIER_ATTACHMENT_TYPE)
	public DossierDataDto generateOpcDossier(String uuid, LoanDetailValidationResult opcGeneratorDto)
			throws Exception {
		log.info("Start : Détails pour génerer OPC du dossier : {},  {}", uuid, opcGeneratorDto);
		AuditContextHolder.setObjectId(uuid);
		DossierDataCoreDto dossier = dossierDataClient.retrieveByUuid(uuid);

		DossierDataDto dossierDataDto = dossierDataDtoMapper.convertToApiDTO(dossier);
		byte[] opcAsBytes = opcGeneratorService.generateOpc(dossierDataDto, opcGeneratorDto);

		String opcFilename = this.generateOpc(dossierDataDto);
		MultipartFile opcMultipartFile = new BASE64DecodedMultipartFile(opcAsBytes, opcFilename, opcFilename);
		AttachmentDto attachmentDto = this.uploadDocument(opcMultipartFile, uuid, ATTACHMENT_TYPE_OPC);

		DossierAttachmentTypeDto dossierAttachmentTypeDto = new DossierAttachmentTypeDto();
		dossierAttachmentTypeDto.setAttachments(Collections.singletonList(attachmentDto));
		dossierAttachmentTypeDto.setCompleted(true);
		dossierDataDto.getDossierAttachmentTypes().add(dossierAttachmentTypeDto);

		opcGeneratorDto.getLoanDetail().setDossierUuid(uuid);
		saveLoanDetail(opcGeneratorDto.getLoanDetail());

		return dossierDataDto;
	}


	private void saveLoanDetail(LoanDetailDto loanDetailDto){
		try {
			AmortizableLoanDetailDto loanDetail = dossierDataDtoMapper.toAmortizableLoanDetailDto(loanDetailDto);
			dossierDataClient.saveAmortizableLoanDetail(loanDetail);
		}catch (Exception ex){
			log.error("Échec non-bloquant de la sauvegarde du LoanDetail pour le dossier UUID: {}. Raison: {}",
					loanDetailDto.getDossierUuid(), ex.getMessage());
		}
	}

	private String generateNotification(DossierDataDto dossierDataDto) {
		boolean isProspect = dossierDataDto.getCustomerData().getPersonalInfo().isProspect();
		String codeDossier = dossierDataDto.getCodeDossier();

		return isProspect ? getProspectNotificationFilename(codeDossier)
				: getNotificationFilename(codeDossier);
	}

	private String generateOpc(DossierDataDto dossierDataDto) {
		String codeDossier = dossierDataDto.getCodeDossier();
		return  getOpcFilename(codeDossier);
	}

	private boolean hasAttachment(DossierDataCoreDto dossier, String typeCode) {
		return dossier.getDossierAttachmentTypes().stream()
				.filter(d-> typeCode.equals(d.getCodeRefAttachmentType()))
				.anyMatch(type -> !CollectionUtils.isEmpty(type.getAttachments()));
	}

	@Override
	public Boolean isDossierHasMandatoryAttachments(String dossierUuid, String taskStatus) {
		if (StringUtils.isEmpty(dossierUuid)) throw new IllegalArgumentException("Dossier UUID should not be null.");

		List<DossierAttachmentTypeDto> attachmentTypes = getDossierAttachmentTypesByStatus(dossierUuid, taskStatus);

		return CollectionUtils.isEmpty(attachmentTypes) || !CollectionUtils.isEmpty(attachmentTypes) && attachmentTypes.stream()
				.filter(dat -> Boolean.TRUE.equals(dat.getMandatory()))
				.allMatch(dat -> !CollectionUtils.isEmpty(dat.getAttachments()));
	}

	@Override
	@Auditable(actionType = AuditActionType.SEND_TO_CTB, objectClass = AuditableObject.DOSSIER_DATA)
	public DossierDataDto assignDossierToCTB(String uuid, UserDto userDto) throws Exception {
		DossierDataCoreDto dossier = dossierDataClient.retrieveByUuid(uuid);
		return this.advanceDossier(dossier, WorkflowTaskCompletionDto.builder()
				.object(userDto)
				.build());
	}

	@Override
	@Auditable(actionType = AuditActionType.SEND_OPC_TO_VALIDATE, objectClass = AuditableObject.DOSSIER_DATA)
	public DossierDataDto sendOpcForValidationTask(String uuid, CommentDto comment) throws Exception {
		DossierDataCoreDto dossier = dossierDataClient.retrieveByUuid(uuid);
		return this.advanceDossier(dossier, WorkflowTaskCompletionDto.builder()
				.operationResult(WorkflowValidationResult.VALID).comment(comment).build());
	}

	/**
	 * POP-1958
	 * Permet d'affecter un dossier à un utilisateur via son matricule
	 * @param uuid
	 * @param matricule
	 * @return
	 * @throws Exception
	 */
	@Override
	@Auditable(actionType = AuditActionType.ASSIGN, objectClass = AuditableObject.DOSSIER_DATA)
	public DossierDataDto assignDossier(String uuid, String matricule) throws Exception {
		AuditContextHolder.setObjectId(uuid);

		return assignDossierTask(uuid, matricule, null);
	}

	@Override
	@Auditable(actionType = AuditActionType.ASSIGN_TO_SELF, objectClass = AuditableObject.DOSSIER_DATA)
	public DossierDataDto assignDossierToCurrentUser(String uuid) throws Exception {
		AuditContextHolder.setObjectId(uuid);
		TaskResult task = ppWorkflowService.getTask(uuid);
		if(task != null && (task.getAssignee() == null || List.of(DossierUserEntity.DMR.toString(), RSTC.toString()).contains(UserHelper.getCurrentUser().getCodeProfession()) )) {
			String matricule = UserHelper.getCurrentUser().getMatricule();
			return assignDossierTask(uuid, matricule, null);
		}
		throw new TechnicalException("Ce dossier est déjà affecté à une autre personne.");
	}

	@Override
	@Auditable(actionType = AuditActionType.DELIVER_OPC_TO_CLIENT, objectClass = AuditableObject.DOSSIER_DATA)
	public DossierDataDto patchOPCDates(String uuid, OpcDateDto opcDateDto) throws Exception {
		DossierDataCoreDto dossier = dossierDataClient.retrieveByUuid(uuid);
		if (DossierStatus.OPC_VALIDATED.getCode().equals(dossier.getCodeStatus())) {
			Assert.True(opcDateDto.getOpcDeliveryDate() != null
							&& (opcDateDto.getOpcDeliveryDate().isEqual(LocalDate.now())
							|| opcDateDto.getOpcDeliveryDate().isBefore(LocalDate.now()))
					,messageService.getMessage(MessageKeyConstants.API_ACTION_NOT_ALLOWED));
			dossier.setOpcDeliveryDate(opcDateDto.getOpcDeliveryDate());
			dossierDataClient.update(uuid, dossier);
		} else if (DossierStatus.OPC_REMIS_AU_CLIENT.getCode().equals(dossier.getCodeStatus())) {
			Assert.True(opcDateDto.getDateOfReceiptOpcSigned() != null
							&& (opcDateDto.getDateOfReceiptOpcSigned().isEqual(dossier.getOpcDeliveryDate()) ||
							opcDateDto.getDateOfReceiptOpcSigned().isAfter(dossier.getOpcDeliveryDate()))
					,messageService.getMessage(MessageKeyConstants.API_ACTION_NOT_ALLOWED));
			dossier.setDateOfReceiptOpcSigned(opcDateDto.getDateOfReceiptOpcSigned());
			dossierDataClient.update(uuid, dossier);
		}

		return this.advanceDossier(dossier,
				WorkflowTaskCompletionDto.builder().operationResult(WorkflowValidationResult.VALID).build());
	}

	@Override
	@Auditable(actionType = AuditActionType.SEND_PHYSICAL_DOSSIER, objectClass = AuditableObject.DOSSIER_DATA)
	public DossierDataDto sendPhysicalDossier(String uuid) throws Exception {
		DossierDataCoreDto dossier = dossierDataClient.retrieveByUuid(uuid);
		return this.advanceDossier(dossier,
				WorkflowTaskCompletionDto.builder().operationResult(WorkflowValidationResult.VALID).build());
	}

	@Override
	public DossierDataDto sendRequestDocuments(DossierDataDto dossierDataDto) throws Exception {
		DossierDataCoreDto dossier = dossierDataClient.retrieveByUuid(dossierDataDto.getUuid());
		Assert.equals(dossier.getCodeStatus(), DossierStatus.TRAITER_RELATION_NOTAIRE.getCode(),
				messageService.getMessage(MessageKeyConstants.API_ACTION_NOT_ALLOWED_STATUS_NOT_VALID));
		dossierDataDto.setStatus(DossierStatus.ATTENTE_RETOUR_NOTAIRE.getCode());
		dossierDataDto.setCodeStatus(DossierStatus.ATTENTE_RETOUR_NOTAIRE.getCode());
		DossierDataCoreDto updatedDossier = dossierDataClient.update(dossierDataDto.getUuid(), dossierDataDtoMapper.convertToCoreDTO(dossierDataDto));

		return dossierDataDtoMapper.convertToApiDTO(updatedDossier);
	}

	@Override
	@Auditable(actionType = AuditActionType.CONTROL_WARRANTIES, objectClass = AuditableObject.DOSSIER_DATA)
	public DossierDataDto sendToControlWarranties(String uuid) throws Exception {
		DossierDataCoreDto dossier = dossierDataClient.retrieveByUuid(uuid);
		return this.advanceDossier(dossier,
				WorkflowTaskCompletionDto.builder().operationResult(WorkflowValidationResult.CONTROL_WARRANTIES).build());
	}

	@Override
	@Auditable(actionType = AuditActionType.VALIDATE_OPC, objectClass = AuditableObject.DOSSIER_DATA)
	public DossierDataDto validateOPC(String uuid) throws Exception {
		DossierDataCoreDto dossier = dossierDataClient.retrieveByUuid(uuid);
		return this.advanceDossier(dossier, WorkflowTaskCompletionDto.builder().operationResult(WorkflowValidationResult.VALID).build());
	}

	@Override
	@Auditable(actionType = AuditActionType.ASSIGN_TO_USER, objectClass = AuditableObject.DOSSIER_DATA)
	public DossierDataDto assignDossierTask(String uuid, String matricule, CommentDto comment) {
		log.info("Params for assign dossier task uuid: {}, registration number: {}, comment: {}",uuid, matricule, comment);

		if(uuid == null || matricule == null){
			throw new IllegalArgumentException(Errors.PARAMETERS_IS_NULL_REGISTRATION_NUMBER_OR_UUID);
		}

		try{
			DossierDataCoreDto dossier = dossierDataClient.retrieveByUuid(uuid);
			Assert.notNull(dossier, Errors.DOSSIER_DOESN_T_EXIST);
			dossierDataHelper.purgeNonUpdatableDossierFields(dossier);

			UserDto userDto = userService.getUserByMatricule(matricule);
			Assert.notNull(userDto, "User registration number doesn't exist");

			boolean result = ppWorkflowService.assignTask(dossier, userDto);
			Assert.True(result, "Dossier: "+uuid+" can't be assigned to :"+ matricule);

			handleComment(comment, userDto, dossier);
			dossierDataClient.update(dossier.getUuid(), dossier);
			return retrieveByUuid(uuid);
		}catch (Exception e) {
			log.error("Error assigning dossier task", e);
			throw new TechnicalException("Error assigning dossier task");
		}
	}

	@Override
	@Auditable(actionType = AuditActionType.SEND_PHYSICAL_DOSSIER, objectClass = AuditableObject.DOSSIER_DATA)
	public DossierDataDto notaryMinutesRequest(String uuid) throws Exception {
		DossierDataCoreDto dossier = dossierDataClient.retrieveByUuid(uuid);
		return this.advanceDossier(dossier, WorkflowTaskCompletionDto.builder().build());
	}

	@Override
	@Auditable(actionType = AuditActionType.TRANSFER_NOTARY_RELATION, objectClass = AuditableObject.DOSSIER_DATA)
	public DossierDataDto transferToNotaryRelation(String uuid, CommentDto comment) throws Exception {
		DossierDataCoreDto dossierDataCoreDto = dossierDataClient.retrieveByUuid(uuid);
		WorkflowValidationResult workflowValidationResult = null;
		if(Arrays.asList(DossierStatus.CONTROLE_MINUTE_ENGAGEMENT.getCode(),DossierStatus.INFO_COMPL_DSC_MIS.getCode()).contains(dossierDataCoreDto.getCodeStatus())) {
			workflowValidationResult = WorkflowValidationResult.INVALID;
		} else if (DossierStatus.TRAITER_DSC_MIS.getCode().equals(dossierDataCoreDto.getCodeStatus())) {
			workflowValidationResult = WorkflowValidationResult.VALID;
			dossierDataCoreDto.setDateOfReceiptPhysicalFile(LocalDate.now());
			dossierDataClient.update(uuid, dossierDataCoreDto);
		}
		return this.advanceDossier(dossierDataCoreDto, WorkflowTaskCompletionDto.builder()
				.operationResult(workflowValidationResult).comment(comment).build());
	}

	@Override
	public DossierDataDto validateDossierForRelease(String uuid) throws Exception {
		DossierDataCoreDto dossier = dossierDataClient.retrieveByUuid(uuid);
		return this.advanceDossier(dossier,
				WorkflowTaskCompletionDto.builder().operationResult(WorkflowValidationResult.VALID).build());
	}

	@Override
	@Auditable(actionType = AuditActionType.RELEASE_DOSSIER, objectClass = AuditableObject.DOSSIER_DATA)
	public DossierDataDto releaseDossier(String uuid, ReleaseDossierDto releaseDossierDto) throws Exception {
		DossierDataCoreDto dossier = dossierDataClient.retrieveByUuid(uuid);

		checkACHAttachedIncaseOfConstructionAndDEBT(dossier);
		if(!DossierStatus.PARTIAL_RELEASE_AGENCY.getCode().equals(dossier.getCodeStatus())){
			ReleaseDossierDto computedDto = getAmountToRelease(dossier, releaseDossierDto);
			if(dossier.getFirstReleasedDate() == null){
				dossier.setFirstReleasedDate(LocalDateTime.now());
			}
			dossier.getLoanData().setAmountReleased(computedDto.getAmountToRelease());
			dossierDataClient.update(uuid, dossier);
		}

		return this.advanceDossier(dossier,
				WorkflowTaskCompletionDto.builder()
						.object(releaseDossierDto)
						.operationResult(WorkflowValidationResult.RELEASE_DOSSIER)
						.build());
	}

	private void checkACHAttachedIncaseOfConstructionAndDEBT(DossierDataCoreDto dossier) {
		String loanObject = dossier.getLoanData().getCodeLoanObject();
		boolean isConstructionRelated = "CST".equals(loanObject) || "AQS_CST".equals(loanObject);
		if(DEBLOCAGE_TOTAL.equals(dossier.getCodeStatus()) && isConstructionRelated && !hasAttachment(dossier, ACH_ATTACHMENT_CODE)){
			throw new FunctionalException(Errors.ACH_MANDATORY_IF_DEBLOCAGE_TOTAL, Errors.ACH_MANDATORY_IF_DEBLOCAGE_TOTAL_MESSAGE);
		}
	}

	@Override
	public DossierDataDto receivePhysicalFile(String uuid) throws Exception {
		DossierDataCoreDto dossier = dossierDataClient.retrieveByUuid(uuid);
		return this.advanceDossier(dossier,
				WorkflowTaskCompletionDto.builder().operationResult(WorkflowValidationResult.VALID).build());
	}

	/**
	 * this method create new dossier request in case return instance to decision or
	 * in additional more info before generate notification
	 * @param dossierRequestDto
	 * @param dossier
	 * @return DossierRequestDto
	 * @throws IllegalArgumentException
	 */
	@Override
	public DossierRequestDto createDossierRequest(DossierRequestDto dossierRequestDto, DossierDataCoreDto dossier) throws IllegalArgumentException{
		DossierDataDto dossierDataDto = dossierDataDtoMapper.convertToApiDTO(dossier);
		DossierRequestDto dossierData= dossierRequestMapper.toDossierRequestDto(dossierDataDto);
		List<RequestWarrantyDto> requestWarranties = getApprovedWarranties(dossier);
		boolean hasNotChanged = dossierRequestDto.compareSpecificAttributes(dossierData,requestWarranties);

		if(hasNotChanged){
			throw new TechnicalException("Sorry, No changes found !");
		}
		DossierDataCoreDto dossierTmp = new DossierDataCoreDto();
		BeanUtils.copyProperties(dossier, dossierTmp);
		if(dossierTmp.getLoanData() != null){
			dossierTmp.getLoanData().setLoanAmount(dossierRequestDto.getLoanAmount());
		}
		dossierTmp.setWarranties(dossierRequestMapper.requestWarrantiesToWarranties(dossierRequestDto.getRequestWarranties()));
		generateDefaultWarranties(dossierTmp);

		dossierRequestDto.setRequestWarranties(dossierRequestMapper.warrantiesToRequestWarranties(dossierTmp.getWarranties()));
		UserDto currentUser = ApplicationContextHolder.getUserContext().getUser();
		dossierRequestDto.setCreatedBy(currentUser);
		dossierRequestDto.setStageDossier(dossierDataDto.getCodeStage());
		dossierRequestDto.setStatusDossier(dossierDataDto.getCodeStatus());
		dossierRequestDto.setRequestStatus(RequestStatus.IN_PROGRESS.toString());
		return dossierDataClient.createDossierRequest(dossierRequestDto);
	}


	private List<RequestWarrantyDto> getApprovedWarranties(DossierDataCoreDto dossier) {
		if(dossier == null) return Collections.emptyList();
		return Optional.ofNullable(dossier.getDossierAttachmentTypes())
				.orElseGet(Collections::emptyList)
				.stream()
				.flatMap(dto -> Optional.ofNullable(dto.getAttachments()).orElseGet(Collections::emptyList).stream())
				.filter(attachment -> ATTACHMENT_TYPE_NOTIFICATION.equals(attachment.getAttachmentTypeCode()))
				.max(Comparator.comparing(AttachmentDto::getUploadedAt))
				.map(latestAttachment -> dossier.getWarranties()
						.stream()
						.filter(w -> Objects.nonNull(w.getAttachment()))
						.filter(w -> latestAttachment.getUuid().equals(w.getAttachment().getUuid()))
						.map(this::buildRequestWarranty)
						.collect(Collectors.toList()))
				.orElse(Collections.emptyList());
	}

	private RequestWarrantyDto buildRequestWarranty(WarrantyDto warranty) {
		return RequestWarrantyDto.builder()
				.content(warranty.getContent())
				.build();
	}

	@Override
	public DossierRequestDto updateDossierRequest(DossierRequestDto dossierRequestDto) {
		UserDto currentUser = ApplicationContextHolder.getUserContext().getUser();
		dossierRequestDto.setDecidedBy(currentUser);
		return dossierDataClient.updateDossierRequest(dossierRequestDto);
	}

	@Override
	@Auditable(actionType = AuditActionType.CONSULTATION_DOSSIER_REQUESTS, objectClass = AuditableObject.DOSSIER_REQUEST)
	public List<DossierRequestDto> getDossierRequests(String dossierUuid) {
		return dossierRequestMapper.convertToListDto(dossierDataClient.getDossierRequests(dossierUuid));
	}

	private void updateDossierWithRequestData(DossierDataCoreDto dossier, DossierRequestDto requestDto) {
		if (dossier != null) {
			DossierDataCoreDto dossierDataCoreDto = dossierDataDtoMapper.convertToCoreDTO(requestDto.getDossier());
			dossier.setNotary(dossierDataCoreDto.getNotary());
			dossier.setPropertyData(dossierDataCoreDto.getPropertyData());
		} else {
			throw new TechnicalException("Dossier null");
		}
	}
	@Override
	@Auditable(actionType = AuditActionType.SEND_BACK_TO_DECISION, objectClass = AuditableObject.DOSSIER_DATA)
	public DossierDataDto sendBackToDecisionInstance(String uuid, AccordType accord, DossierRequestDto dossierRequestDto) throws Exception {
		DossierDataCoreDto dossier = dossierDataClient.retrieveByUuid(uuid);
		if(AccordType.PRINCIPE.equals(accord)) {
			updateDossierWithRequestData(dossier, dossierRequestDto);
			dossierDataClient.update(uuid, dossier);
		}

		return this.advanceDossier(dossier, WorkflowTaskCompletionDto.builder()
				.operationResult(AccordType.PRINCIPE.equals(accord)
						 ? WorkflowValidationResult.ACCORD_PRINCIPE :  WorkflowValidationResult.BACK_TO_DECISION
				).object(dossierRequestDto).build());
	}

	@Override
	@Auditable(actionType = AuditActionType.SEND_BACK_TO_DR_DRPP, objectClass = AuditableObject.DOSSIER_DATA)
	public DossierDataDto sendBackToDrDrpp(String uuid,  CommentDto comment) throws Exception {
		DossierDataCoreDto dossier = dossierDataClient.retrieveByUuid(uuid);
		return this.advanceDossier(dossier, WorkflowTaskCompletionDto.builder()
				.operationResult(WorkflowValidationResult.BACK_TO_DECISION).comment(comment).build());
	}

	@Override
	public DossierDataDto updateWarrantiesAndRestrictions(String uuid, NotificationGeneratorDto notificationGeneratorDto) {
		log.info("begin update wrranties request And restrictions dossier with params: {}", notificationGeneratorDto);
		DossierDataDto dataDto = dossierDataClient.updateWarrantiesAndRestrictions(uuid, notificationGeneratorDto);
		log.info("end  begin update wrranties request And restrictions dossier with params: {}", notificationGeneratorDto);
		return dataDto;

	}

	@Override
	public AttachmentDto uploadCreditBureauDocument(String uuid, String attachmentTypeCode) {
		AuditContextHolder.setComment(DOSSIER_DATA_UUID + uuid + ", attachmentType code: " + attachmentTypeCode);
		AttachmentDto attachmentDto = null;

		String userEmail = Optional.ofNullable(usernameHeader)
				.filter(email -> !usernameHeader.isEmpty())
				.orElse(dossierDataHelper.getCurrentuser().getEmail());

		try {
			DossierDataCoreDto dossier = dossierDataClient.retrieveByUuid(uuid);

			CreditBureauRequestDto requestDto = creditBureauService.createRequest(dossier);

			log.info("credit bureau request {}", requestDto);

			CreditBureauResponseDto responseDto = creditBureauClient.generateCreditBureauReport(userEmail, requestDto);

			log.info("credit bureau response {}", responseDto);

			if (responseDto == null || CollectionUtils.isEmpty(responseDto.getReports())) {
				throw new TechnicalException("No reports found in Credit Bureau response");
			}

			ReportDto reportDto = responseDto.getReports().stream()
					.filter(report -> report.getData() != null && !report.getData().isEmpty())
					.findFirst()
					.orElseThrow(() -> new TechnicalException("No valid Base64 document found in Credit Bureau reports."));

			byte[] pdfBytes = Base64.getDecoder().decode(reportDto.getData());

			MultipartFile file = new BASE64DecodedMultipartFile(pdfBytes, reportDto.getNom() + "." + reportDto.getExtension(), "Rapport Crédit Bureau");

			attachmentDto = attachmentService.upload(file, uuid, attachmentTypeCode);

			if (attachmentDto == null) {
				throw new TechnicalException("Empty or null document received after upload");
			}

		} catch (Exception e) {
			log.error("Cannot upload document for dossier: {}", uuid, e);
			throw new TechnicalException("Cannot upload document for dossier " + uuid);
		}

		AuditContextHolder.setObjectId(attachmentDto.getUuid());
		return attachmentDto;
	}

	@Override
	@Auditable(actionType = AuditActionType.REJECT_DOSSIER_REQUEST, objectClass = AuditableObject.DOSSIER_REQUEST)
	public DossierDataDto rejectDossierRequest(String uuid, CommentDto comment) throws Exception {
		DossierDataCoreDto dossier = dossierDataClient.retrieveByUuid(uuid);
		return this.advanceDossier(dossier,
				WorkflowTaskCompletionDto.builder()
						.operationResult(WorkflowValidationResult.REQUEST_REJECTED)
						.object(RequestStatus.REJECTED)
						.comment(comment)
						.build());
	}

	@Override
	@Auditable(actionType = AuditActionType.VALIDATE_DOSSIER_REQUEST, objectClass = AuditableObject.DOSSIER_REQUEST)
	public DossierDataDto validateDossierRequest(String uuid) throws Exception {
		try {
			DossierRequestDto dossierRequestDto = dossierDataClient.getDossierRequestByUuid(uuid);
			Assert.notNull(dossierRequestDto, messageService.getMessage(MessageKeyConstants.DOSSIER_REQUEST_INPROGRESS_NOTFOUND));
			String dossierUuid = dossierRequestDto.getDossier().getUuid();
			Assert.notNull(dossierUuid, "dossierUuid should be not null !");
			DossierDataDto dossier= dossierRequestMapper.toDossierDataDto(dossierRequestDto);
			dossier.setUuid(dossierUuid);
			DossierDataDto dossierDataDto = patchDossier(dossier);
			dossierRequestDto.setRequestStatus(RequestStatus.ACCEPTED.toString());
			this.updateDossierRequest(dossierRequestDto);
			return dossierDataDto;
		}
		catch(RuntimeException ex){
			log.error("Error in validateDossierRequest ",ex);
			throw new TechnicalException("You cannot perform this action");
		}
	}

	@Override
	@Auditable(actionType = AuditActionType.USERS, objectClass = AuditableObject.DOSSIER_USERS)
	public List<RefUserDto> getAllUsersByProfession(String businessKey) {
		log.info("Starting user retrieval for businessKey: {}", businessKey);
		List<String> authorizedProfessions = Arrays.asList("CTB","SCC","CTB_GBO_RN","CTB_GAR");
		TaskResult task = ppWorkflowService.getTask(businessKey);
		if(task != null){
			log.info("Task retrieved for businessKey {}: assignee = {}", businessKey, task.getAssignee());
			String codeProfession = getCodeProfessionForTaskAssignee(businessKey,task.getAssignee());
			if(authorizedProfessions.contains(codeProfession)){
				log.info("Authorized profession detected: {}. Fetching matching users...", codeProfession);
				UserCriteriasDto userCriteria= UserCriteriasDto.builder().codeProfessions(Collections.singletonList(codeProfession)).build();
				return fetchUsers(userCriteria);
			}
		}
		return Collections.emptyList();
	}

	@Override
	@Auditable(actionType = AuditActionType.USERS, objectClass = AuditableObject.DOSSIER_USERS)
	public List<RefUserDto> getAllUsersByHierarchy(String businessKey) {
		try{
			DossierDataCoreDto dossierCore = dossierDataClient.retrieveByUuid(businessKey);
			DossierDataDto dossier = dossierDataDtoMapper.convertToApiDTO(dossierCore);
			Assert.True(Objects.nonNull(dossier) && Objects.nonNull(dossier.getDossierOrganization()),
					"Dossier must be not null");
			UserDto connectedUser = UserHelper.getCurrentUser();
			List<String> professions = getAuthorizedProfessions(dossier.getCodeStage(), dossier.getCodeStatus());
			if (Objects.isNull(professions)) {
				throw new FunctionalException(Errors.REASSIGN_NOT_AUTH_IN_STAGE, Errors.REASSIGN_NOT_AUTH_IN_STAGE_DEC);
			}

			UserDto assignee = getCurrentAssignee(businessKey);
			if (Objects.isNull(assignee)) {
				throw new FunctionalException(Errors.REASSIGN_NOT_ASSIGNED_TO_USER, Errors.REASSIGN_NOT_ASSIGNED_TO_USER_DESC);
			}
			if (!isUserInDirectory(assignee, connectedUser)) {
				throw new FunctionalException(Errors.CONECTED_USER_IS_NOT_PART_ASSIGNEE_HIEARARCHY, Errors.CONECTED_USER_IS_NOT_PART_ASSIGNEE_HIEARARCHY_DESC);
			}

			DossierOrganization organization =dossier.getDossierOrganization();
			UserCriteriasDto combinedCriteria= UserCriteriasDto.builder()
					.codeProfessions(professions)
					.drCode(organization.getDrCode())
					.ucCode(organization.getUcCode())
					.drppCode(organization.getDrppCode())
					.agencyCode(organization.getAgencyCode())
					.assignee(assignee.getMatricule())
					.build();

			log.info("Fetching users with combined criteria: {}", combinedCriteria);
			List<RefUserDto> users = fetchUsers(combinedCriteria);
			log.info("Fetched {} users in total", users.size());

			return users;
		} catch (IllegalArgumentException ex) {
			log.error("Validator selection error: {}", ex.getMessage());
			throw new TechnicalException("Validator selection: " + ex.getMessage());
		} catch (RuntimeException ex) {
			log.error("Unexpected error: {}", ex.getMessage());
			throw new TechnicalException("Unexpected error: " + ex.getMessage());
		}
	}

	@Override
	public Boolean isDossierAuthorizedReassign(String dossierUuid) {
		if (StringUtils.isEmpty(dossierUuid))
			throw new IllegalArgumentException("Dossier UUID should not be null.");
		DossierDataCoreDto dossier = dossierDataClient.retrieveByUuid(dossierUuid);
		if (dossier == null)
			throw new IllegalArgumentException(Errors.DOSSIER_SHOULD_NOT_BE_NULL);
		String codeStatus = dossier.getCodeStatus();
		if (StringUtils.isEmpty(codeStatus))
			throw new IllegalArgumentException("dossier status should not be null or null.");

		List<String> opcStatus = DossierStatus.getOpcStatus();

		return  opcStatus.contains(codeStatus) && checkIfUserIsFirstDeliveryManger(dossier);
	}


	@Override
	public ReassignmentRequestDto createReassignRequest(String uuid, String matricule, CommentDto comment) {

		if(uuid == null || matricule == null){
			throw new IllegalArgumentException(Errors.PARAMETERS_IS_NULL_REGISTRATION_NUMBER_OR_UUID);
		}
		ReassignmentRequestDto lastReassignInprogress = dossierDataClient.getLastReassignInprogress(uuid);
		if (lastReassignInprogress!=null){
			throw new CustomizedException(Errors.DOSSIER_HAS_ALREADY_REASSIGN_REQUEST,Errors.DOSSIER_HAS_ALREADY_REASSIGN_REQUEST_PRESENT_DSC);
        }

		try{
			DossierDataCoreDto dossier = dossierDataClient.retrieveByUuid(uuid);
			Assert.notNull(dossier, Errors.DOSSIER_DOESN_T_EXIST);
			RefUserDto userDto = referentialService.getUserByMatricule(matricule);
			Assert.notNull(userDto, "User registration number doesn't exist");

			UserDto currentAssign = getCurrentAssignee(uuid);
			Assert.notNull(currentAssign, "dossier doesn't assigned");

			UserDto currentUser = UserHelper.getCurrentUser();
			DossierDataDto dossierDataDto = DossierDataDto.builder().uuid(dossier.getUuid()).build();

			ReassignmentRequestDto reassignmentRequestDto = ReassignmentRequestDto.builder()
					.dossier(dossierDataDto)
					.RequestedBy(currentUser)
					.comment(Objects.isNull(comment.getMessage()) ? null : comment.getMessage())
					.statusDossier(dossier.getCodeStatus())
					.oldAssignee(currentAssign.getMatricule())
					.newAssignee(matricule)
					.requestStatus(RequestStatus.IN_PROGRESS.toString())
					.build();
			dossierDataHelper.purgeNonUpdatableDossierFields(dossier);

			handleComment(comment, UserDto.builder().fullName(userDto.getFullName()).build(), dossier);
			dossierDataClient.update(dossier.getUuid(), dossier);

			TaskResult oldTask = new TaskResult();
			oldTask.setAssignee(currentAssign.getFullName());
			TaskResult newTask = new TaskResult();
			oldTask.setAssignee(userDto.getFullName());

			NotifyFrontOfficeForNewRequestStrategy notifyFrontOfficeForNewRequestStrategy = notifyStrategyFactory.getStrategy(NotifyFrontOfficeForNewRequestStrategy.class);
			notifyFrontOfficeForNewRequestStrategy.sendNotification(dossier,NotificationContext.builder().oldTask(oldTask).newTask(newTask).connectedUser(currentUser).build());

			return dossierDataClient.createReassignRequest(reassignmentRequestDto);

		}catch (Exception e) {
			log.error("Error while creating reassign request  dossier ", e);
			throw new TechnicalException("Error while creating reassign request  dossier");
		}

	}

	@Override
	@Auditable(actionType = AuditActionType.TASKS_CONSULTATION, objectClass = AuditableObject.DOSSIER_DATA)
	public SearchResponse<DossierDataResult> getReassignRequests(Integer page, Integer itemsPerPage) {

		SearchRequest<DossierDataCriteria> dossierDataSearch = new SearchRequest<>();
		dossierDataSearch.setPage(page);
		dossierDataSearch.setItemsPerPage(itemsPerPage);
		dossierDataSearch.setSearchCriteria(DossierDataCriteria.builder()
						.drppUser(UserHelper.getCurrentUser().getDrppCode())
				        .build());

		AuditContextHolder.setComment(dossierDataSearch.toString());
        dossierDataSearch.setResultFormat(AbstractDossierData.SHORT_FORMAT);

		SearchResponse<AbstractDossierData> userDossiers = dossierDataClient.getReassignRequests(dossierDataSearch);

		if (userDossiers == null || userDossiers.getResult() == null) {
			return new SearchResponse<>(Collections.emptyList(), 0, 0, 0, 0, 0);
		}

		List<DossierDataResult> userDossiersResult = userDossiers.getResult().parallelStream()
				.map(item -> dossierDataDtoMapper.convertToDossierDataResult(DossierDataResultCoreDto.class.cast(item)))
				.collect(Collectors.toList());

		return new SearchResponse<>(userDossiersResult,
				userDossiers.getCurrentPage(),
				userDossiers.getTotalPages(),
				userDossiers.getNumberOfElementsPerPage(),
				userDossiers.getNumberOfElementsInPage(),
				userDossiers.getTotalElements());
	}

	@Override
	@Auditable(actionType = AuditActionType.VALIDATE_REASSIGN_REQUEST, objectClass = AuditableObject.DOSSIER_DATA)
	public ReassignmentRequestDto validateReassignRequest(String requestUuid, CommentDto comment) throws Exception {
		ReassignmentRequestDto requestDto = dossierDataClient.getReassignRequestByUuid(requestUuid);
		if(requestDto == null || requestDto.getDossier() == null){
			throw new IllegalArgumentException(Errors.DOSSIER_SHOULD_NOT_BE_NULL);
		}
		DossierDataDto dossier = assignDossierTask(requestDto.getDossier().getUuid(), requestDto.getNewAssignee(), comment);
		Assert.notNull(dossier, "Error with assignTask");

		requestDto.setValidatedBy(ApplicationContextHolder.getUserContext().getUser());
		requestDto.setValidationDate(LocalDateTime.now());
		requestDto.setRequestStatus(RequestStatus.ACCEPTED.toString());
		ReassignmentRequestDto result = dossierDataClient.updateReassignRequest(requestUuid, requestDto);
		Assert.notNull(result, "Error updating reassign request uuid : "+ requestUuid);
		ReassignmentRequestDataDto reassignmentRequestDataDto = reassignmentRequestMapper.convertRequestDataToDTO(result);
		UserDto connectedUser = ApplicationContextHolder.getUserContext().getUser();
		NotifyReassignmentRequesterStrategy notifyRequesterStratgy = notifyStrategyFactory.getStrategy(NotifyReassignmentRequesterStrategy.class);
		notifyRequesterStratgy.sendNotification(dossierDataDtoMapper.convertToCoreDTO(dossier), NotificationContext.builder().requestDto(reassignmentRequestDataDto).connectedUser(connectedUser).build());

		return result;
	}

	@Override
	@Auditable(actionType = AuditActionType.REJECT_REASSIGN_REQUEST, objectClass = AuditableObject.DOSSIER_DATA)
	public ReassignmentRequestDto rejectReassignRequest(String requestUuid, CommentDto comment) throws Exception {
		ReassignmentRequestDto requestDto = dossierDataClient.getReassignRequestByUuid(requestUuid);
		Assert.notNull(requestDto, "Request uuid : "+requestUuid+" doesn't exist");

		requestDto.setValidatedBy(ApplicationContextHolder.getUserContext().getUser());
		requestDto.setValidationDate(LocalDateTime.now());
		requestDto.setRequestStatus(RequestStatus.REJECTED.toString());

		ReassignmentRequestDto result = dossierDataClient.updateReassignRequest(requestUuid, requestDto);
		Assert.notNull(result, "Error updating reassign request uuid : "+ requestUuid);

		DossierDataCoreDto dossier = dossierDataDtoMapper.convertToCoreDTO(result.getDossier());
		dossierDataHelper.purgeNonUpdatableDossierFields(dossier);
		dossierDataHelper.fillComment(comment, dossier);
		DossierDataCoreDto updatedDossier = dossierDataClient.update(dossier.getUuid(), dossier);
		Assert.notNull(updatedDossier, "Error updating dossier uuid : "+ result.getDossier().getUuid());

		ReassignmentRequestDataDto reassignmentRequestDataDto = reassignmentRequestMapper.convertRequestDataToDTO(result);
		UserDto connectedUser = ApplicationContextHolder.getUserContext().getUser();

		NotifyReassignmentRequesterStrategy notifyRequesterStratgy = notifyStrategyFactory.getStrategy(NotifyReassignmentRequesterStrategy.class);
		notifyRequesterStratgy.sendNotification(updatedDossier,NotificationContext.builder().connectedUser(connectedUser).requestDto(reassignmentRequestDataDto).build() );

		return result;
	}

	@Override
	public ReassignmentRequestDto getLastReassignInprogress(String dossierUuid) throws Exception {
		return reassignmentRequestMapper.convertToDTO(dossierDataClient.getLastReassignInprogress(dossierUuid));
	}

	@Override
	public List<RefUserDto> getAllCTBByDeliveryManager(String uuid,String currentUserMatricule, String actionType) {
		if(uuid == null || currentUserMatricule==null){
			throw new IllegalArgumentException(Errors.PARAMETERS_IS_NULL_REGISTRATION_NUMBER_OR_UUID);
		}

		try{
			DossierDataCoreDto dossier = dossierDataClient.retrieveByUuid(uuid);
			Assert.notNull(dossier, Errors.DOSSIER_DOESN_T_EXIST);

			DossierOrganization dossierOrganization = dossier.getDossierOrganization();
			Assert.notNull(dossierOrganization, "dossierOrganization doesn't exist");
			String unitCode=dossierOrganization.getDrppCode();
			if(dossier.getCustomerData().getCard().getMarket().contains("09")){
				unitCode=dossierOrganization.getAgencyCode();
			}
			Assert.True(!StringUtils.isEmpty(unitCode) , "unit code  Dossier is Not Found: "+dossier.getUuid());

			return	referentialService.getAllCTBByDRPP(unitCode,currentUserMatricule,actionType);
		}catch (Exception e) {
			log.error("Error get  all ctb ", e);
			throw new TechnicalException("Error get  all ctb");
		}
	}

	@Auditable(actionType = AuditActionType.REQUEST_RISK_MANGER_FEEDBACK, objectClass = AuditableObject.DOSSIER_DATA)
	@Override
	public DossierDataDto requestRiskMangerFeedBack(String uuid, CommentDto comment)  {
		AuditContextHolder.setObjectId(uuid);
        List<String> desicionAuthorityList  = Arrays.asList("DA_FO","DA", "DCL","ADA");
        List<String> profsAssignmentLevel3 = Arrays.asList("DRPP","DRA_FO", "RD_FO");
        if(uuid == null ){
			throw new IllegalArgumentException("uuid is null");
		}

		try {
			UserDto currentUser= getCurrentUser();

			RefUserDto refUserDto = fetchRefUser(currentUser.getMatricule());

			WorkflowValidationResult workflowValidationResult = null;
			if (desicionAuthorityList.contains(currentUser.getCodeProfession())){
				workflowValidationResult = WorkflowValidationResult.FEEDBACK_MANGER_DRPP;
			} else if (profsAssignmentLevel3.contains(currentUser.getCodeProfession())) {
				workflowValidationResult = WorkflowValidationResult.FEEDBACK_MANGER_DR;
			}
			RefUserDto assignee= getManager(refUserDto,workflowValidationResult);

			Assert.notNull(assignee, "manger  doesn't exist in Ref User");
			DossierDataCoreDto dossier = dossierDataClient.retrieveByUuid(uuid);
			return this.advanceDossier(dossier, WorkflowTaskCompletionDto.builder()
					.operationResult(workflowValidationResult).object(assignee).comment(comment).build());
		}catch (Exception e){
			log.error("Error occured while request for risk feedBack", e);
			throw new TechnicalException("Error  "+e.getMessage());
		}
	}

	@Override
	@Auditable(actionType = AuditActionType.ACCEPTANCE, objectClass = AuditableObject.DOSSIER_DATA)
	public DossierDataDto riskTransfert(String uuid, String status,CommentDto comment) throws Exception {
		List<String> codeProfessions = resolveRiskProfessions();
		DossierDataCoreDto dossier = dossierDataClient.retrieveByUuid(uuid);
		return this.advanceDossier(dossier,
				WorkflowTaskCompletionDto.builder()
						.operationResult(DossierStatus.DECISION_RISK_RIND.getCode().equals(status) ?
								WorkflowValidationResult.BACK_TO_DECISION_RS:WorkflowValidationResult.RISK_TRANSFERT)
						.comment(comment)
						.object(codeProfessions)
						.build());
	}

	private List<String> resolveRiskProfessions() {
		UserDto currentUser = UserHelper.getCurrentUser();
		List<String> codeProfessionsBP = List.of(ProfessionCode.ARR_FO.toString(), ProfessionCode.ROR.toString(),
				ProfessionCode.RORE.toString());
		List<String> codeProfessionsDefault = List.of(ProfessionCode.ARR.toString(), ProfessionCode.ROR.toString(),
				ProfessionCode.RORE.toString(), ProfessionCode.DRR.toString(), ProfessionCode.ARR_FO.toString());
		if (currentUser != null && !CollectionUtils.isEmpty(currentUser.getProfessionMarketsCodes()) && currentUser.getProfessionMarketsCodes().contains("09")) {
			return codeProfessionsBP;
		}
		return codeProfessionsDefault;
	}



	@Override
	public DossierDataDto assignToResponsableRegionalRisk(String uuid, CommentDto comment) {
		try {
			UserDto currentUser = getCurrentUser();
			RefUserDto refUserDto = fetchRefUser(currentUser.getMatricule());
			RefUserDto ddr = getManager(refUserDto, WorkflowValidationResult.ASSIGN_TO_RRR);
			Assert.notNull(ddr, "manger  doesn't exist in Ref User");
			DossierDataCoreDto dossier = dossierDataClient.retrieveByUuid(uuid);
			return this.advanceDossier(dossier, WorkflowTaskCompletionDto.builder()
					.operationResult(WorkflowValidationResult.ASSIGN_TO_RRR).object(ddr).comment(comment).build());
		}catch (Exception e){
			log.error("Error occured while    request for risk feedBack ", e);
			throw new TechnicalException("Error occured while    request for risk feedBack ");
		}
	}

	@Override
	@Auditable(actionType = AuditActionType.MODIFICATION, objectClass = AuditableObject.DOSSIER_DATA)
	public DossierDataDto updateWarranties(DossierDataDto dossierDto) {
		List<WarrantyDto> warranties = dossierDto.getWarranties();
		List<RestrictionDto> restrictions = dossierDto.getRestrictions();
		log.info("Warranties : {} Restrictions : {}", warranties, restrictions);

		if(CollectionUtils.isEmpty(warranties)){
			throw new IllegalArgumentException("Warranties must be not null");
		}

		if(Arrays.asList(DossierStatus.DECS_ANR_RIDN.getCode(),
				DossierStatus.INFOS_COMP_AVRS_ANR_RIDN.getCode()).contains(dossierDto.getCodeDossier())){
			NotificationGeneratorDto notificationGeneratorDto = NotificationGeneratorDto.builder()
					                           .warranties(warranties).restrictions(restrictions)
					                                            .build();
			DossierDataDto savedDossier = this.updateWarrantiesAndRestrictions(dossierDto.getUuid(), notificationGeneratorDto);
			log.info("Saved Dossier : {}", savedDossier);
			return savedDossier;
		}

		DossierDataCoreDto coreDto = DossierDataCoreDto.builder()
				.uuid(dossierDto.getUuid())
				.warranties(warranties)
				.restrictions(restrictions)
				.build();

		DossierDataDto savedDossier = dossierDataClient.updateWarranties(coreDto);
		log.info("Saved Dossier : {}", savedDossier);
		return savedDossier;
	}

	@Override
	@Auditable(actionType = AuditActionType.SEND_TO_DRDRPP, objectClass = AuditableObject.DOSSIER_DATA)
	public DossierDataDto sendToAvisDrDRPP(String uuid, String matricule, CommentDto comment) throws Exception {
		DossierDataCoreDto dossier = dossierDataClient.retrieveByUuid(uuid);
		return this.advanceDossier(dossier,
				WorkflowTaskCompletionDto.builder().operationResult(WorkflowValidationResult.VALID)
						.comment(comment).object(matricule).build());

	}

    @Override
    @Auditable(actionType = AuditActionType.SEND_TO_ANALIST, objectClass = AuditableObject.DOSSIER_DATA)
    public DossierDataDto sendToAnalistRetailAuthority(String uuid, CommentDto comment) throws Exception {
		DossierDataCoreDto dossier = dossierDataClient.retrieveByUuid(uuid);
        return this.advanceDossier(dossier,
                WorkflowTaskCompletionDto.builder().operationResult(WorkflowValidationResult.NEED_ANALYSIS_RETAIL)
                        .comment(comment).build());
    }

    @Override
    public CcgCommessionMatrix calculateCCGCommission(CcgCommissionRequestDto ccgCommissionRequestDto) {
        log.info("begin calculate ccg Matrix with params: {}", ccgCommissionRequestDto);
        final CcgCommessionMatrix ccgCalculateMatrix = ccgCommissionService.calculateCCGCommission(ccgCommissionRequestDto);
        log.info("end  calculate ccg Matrix with params: {}", ccgCalculateMatrix);
        return ccgCalculateMatrix;
    }

	private UserDto getCurrentUser() {
		UserDto currentUser = UserHelper.getCurrentUser();
		Assert.notNull(currentUser, "user not found");
		return currentUser;
	}

	private  UserDto getCurrentAssignee(String businessKey){
		UserDto currentAssignee=null;
		TaskResult taskCurrent = ppWorkflowService.getTask(businessKey);
		if (!Objects.isNull(taskCurrent) && !StringUtils.isEmpty(taskCurrent.getAssignee())){
			List<DossierUserDto> dossierUsers = dossierDataClient.getDossierUserByUuid(businessKey);
			currentAssignee = dossierUsers.stream()
					.filter(du -> du.getUser().getIdentifier().equals(taskCurrent.getAssignee()))
					.map(DossierUserDto::getUser)
					.findFirst()
					.orElse(null);
		}

		return currentAssignee;
	}

	private RefUserDto fetchRefUser(@NotNull String matricule) {
		RefUserDto refUserDto = referentialService.getUserByMatricule(matricule);
		Assert.notNull(refUserDto, "User registration number doesn't exist In refUser");
		return refUserDto;
	}

	private RefUserDto getManager(RefUserDto userDto, WorkflowValidationResult workflowValidationResult) {
		if (userDto == null) return null;

		String manager;
		if (WorkflowValidationResult.FEEDBACK_MANGER_DRPP.equals(workflowValidationResult)){
			Assert.notEmptyString(userDto.getManagerAssignmentLevel4(), "Manger level 4 not found for User "+userDto.getIdentifier());
			manager = userDto.getManagerAssignmentLevel4().toLowerCase();
		} else if (WorkflowValidationResult.FEEDBACK_MANGER_DR.equals(workflowValidationResult)){
			Assert.notEmptyString(userDto.getManagerAssignmentLevel3(), "Manger level 3 not found for User "+userDto.getIdentifier());
			manager = userDto.getManagerAssignmentLevel3().toLowerCase();
		} else if (WorkflowValidationResult.ASSIGN_TO_RRR.equals(workflowValidationResult) ){
			Assert.notEmptyString(userDto.getCurrentFinalAssignmentCode(), "Manger level 1 not found for User "+userDto.getIdentifier());
			manager = userDto.getCurrentFinalAssignmentCode().toLowerCase();
		} else {
			return null;
		}
		return referentialService.getRefUserByFullName(manager);
	}

	private boolean checkIfUserIsFirstDeliveryManger(DossierDataCoreDto dossier) {
		if(dossier == null) return  false;
		UserDto currentUser = ApplicationContextHolder.getUserContext().getUser();
		List<String> assignmentUnitsList = referentialService.getAllAssignmentUnitsManager(currentUser.getMatricule(), currentUser.getCodeProfession());

		return 	!Objects.isNull(currentUser) &&
				!CollectionUtils.isEmpty(assignmentUnitsList) &&
				(assignmentUnitsList.contains(dossier.getDossierOrganization().getDrppCode())
				|| assignmentUnitsList.contains(dossier.getDossierOrganization().getAgencyCode()));
	}

	private DossierDataCoreDto saveDossier(DossierDataCoreDto dossierDataCoreDto) {
		try {
			log.info("*** Saving dossier : {}", dossierDataCoreDto);
			DossierDataCoreDto result = dossierDataClient.create(dossierDataCoreDto);
			log.info("*** Dossier saved, response: {}", result);
			return result;
		} catch (Exception e) {
			log.error("*** Error saving dossier", e);
			throw new TechnicalException("Error creating dossier");
		}
	}

	private void startLoanProcess(String uuid) {
		log.info("*** start loan process orderID: {} ", uuid);
		try {
			ppWorkflowService.startLoanProcess(uuid);
		} catch (Exception e){
			log.error("*** Error starting loan process", e);
			rollbackLoanOrderCreation(uuid);
			throw new TechnicalException("Error creating dossier");
		}
	}

	private void rollbackLoanOrderCreation(String orderId) {
		log.info("*** Starting rollback dossier creation");
		dossierDataClient.rollbackDossierCreation(orderId);
		log.info("*** End rollback dossier creation");
	}

	private DossierDataDto updateDossier(DossierDataDto dossierDataDto, String codeStatus) {
		Assert.contains(DossierStatus.getStatusEligibleForUpdate(),codeStatus, messageService.getMessage(API_ACTION_NOT_ALLOWED));

		controlDossier(dossierDataDto, !DossierStatus.INITIATION.getCode().equals(codeStatus));
		DossierDataCoreDto dossierDataCoreDto = dossierDataDtoMapper.convertToCoreDTO(dossierDataDto);
		dossierDataHelper.purgeNonUpdatableDossierFields(dossierDataCoreDto);

		// Calculate monthly installment value and set it into 'dossier'
		getMonthlyInstallment(dossierDataCoreDto);
		generateDefaultWarranties(dossierDataCoreDto);

		DossierDataCoreDto updatedDossier = dossierDataClient.update(dossierDataCoreDto.getUuid(), dossierDataCoreDto);
		createDossierAttachmentTypes(updatedDossier,dossierDataDto.getProspectUuid());

		return dossierDataDtoMapper.convertToApiDTO(updatedDossier);
	}

	private List<RefStatusDto> getAllStatus() {
		try {
			return this.referentialService.getAllStatus();
		} catch (Exception e) {
			log.error("error evaluating attachment rule", e);
			return Collections.emptyList();
		}
	}

	private List<String> getStatusByDesignation(String searchValue, List<RefStatusDto> allCodeStatus) {
		if (searchValue == null || CollectionUtils.isEmpty(allCodeStatus)) {
			return Collections.emptyList();
		}
		Predicate<RefStatusDto> predicate = status -> status.getDesignation().toLowerCase().contains(searchValue.toLowerCase());
		return filterCodeStatus(allCodeStatus, predicate);
	}

	private List<String> getStatusByStage(String searchValue, List<RefStatusDto> allCodeStatus) {
		if (searchValue == null || CollectionUtils.isEmpty(allCodeStatus)) {
			return Collections.emptyList();
		}
		Predicate<RefStatusDto> predicate = status -> status.getStage().getDesignation().toLowerCase().contains(searchValue.toLowerCase());
		return filterCodeStatus(allCodeStatus, predicate);
	}

	private List<String> filterCodeStatus(List<RefStatusDto> allCodeStatus, Predicate<RefStatusDto> predicate) {
		return allCodeStatus.stream()
				.filter(predicate)
				.map(RefStatusDto::getCode)
				.collect(Collectors.toList());
	}

	private Boolean isUserInDirectory(UserDto assignee, UserDto connectedUser) {
		if(DossierUserEntity.RD_FO.toString().equals(connectedUser.getCodeProfession())) return true;

		String currentAssignee = assignee.getFullName().replace(" ", "-").toLowerCase();
		String connectedUserFullName = connectedUser.getFullName().replace(" ", "-").toLowerCase();
		log.info("verifyUserInAssigneeHierarchy connectedUserFullName:{} currentAssignee: {}", connectedUserFullName, currentAssignee);

		return userService.verifyUserInAssigneeHierarchy(currentAssignee, connectedUserFullName);
	}

	private List<String> getAuthorizedProfessions(@NotNull String codeStage, @NotNull String codeStatus){
		if(UserHelper.getCurrentUserProfessionMarkets().contains("09")){
			return STAGE_MAP_MARKET_09.get(codeStage);
		}

		if (codeStatus.contains(DossierStatus.ADDITIONAL_AGENCY_INFORMATION.getCode()) || Arrays.asList(
				DossierStatus.OPC_REMIS_AU_CLIENT.getCode(),
				DossierStatus.OPC_VALIDATED.getCode(),
				DossierStatus.OPC_WAITING_EXPERTISE.getCode(),
				DossierStatus.OPC_SIGNED.getCode()).contains(codeStatus)){
			return 	STAGE_MAP.get(DossierStage.INSTRUCTION.getCode());
		}

		return 	STAGE_MAP.get(codeStage);
	}

	private List<RefUserDto> fetchUsers(UserCriteriasDto userCriteriasDto){
		List<RefUserDto> users = userService.getAllUsersByCriterias(userCriteriasDto);
		Assert.notNull(users, "Users must be not null");
		return users.stream().map(userDtoMapper::ignoreRefUserDtoProperties).collect(Collectors.toList());
	}

	private String getCodeProfessionForTaskAssignee(String businessKey, String assignee){
		List<DossierUserDto> dossierUsers = dossierDataClient.getDossierUserByUuid(businessKey);
		return dossierUsers.stream()
				.filter(du-> du.getUser().getIdentifier().equals(assignee))
				.map(DossierUserDto::getCodeProfession)
				.findFirst()
				.orElse(null);
	}

	/**
	 * The purpose of this method is to filter whole attachment to return to be uploaded
	 * Example : AUTREDOCUMENT must return always because status in refAttachmentTypeDto status is 0 or null
	 * Otherwise for example OPC type have 3 status to be shown in list uploaded file
	 * @param dossierDataCoreDto dossier
	 * @return to be shown or not
	 */
	private boolean filterAttachmentType(DossierDataCoreDto dossierDataCoreDto, String code, String taskStatus,
										 Map<String, RefAttachmentTypeStatusDto> mapAttachmentTypeStatus){
		if (!dossierDataCoreDto.getCodeStatus().equals(taskStatus) && TASK_STATUS_MAP.containsKey(taskStatus)) {
			return TASK_STATUS_MAP.get(taskStatus).equals(code);
		}
		if(TASK_STATUS_MAP.containsValue(code)) return false;

		return mapAttachmentTypeStatus.containsKey(code);
	}

	private String getNotificationFilename(String dossierId) {
		return NOTIFICATION_WITH_SPACE.concat(dossierId).concat(DocumentService.PDF);
	}
	private String getOpcFilename(String dossierId) {
		return OPC_WITH_SPACE.concat(dossierId).concat(DocumentService.PDF);
	}

	private String getProspectNotificationFilename(String dossierId) {
		return NOTIFICATION_PROSPECT_WITH_SPACE.concat(dossierId).concat(DocumentService.PDF);
	}


	private DossierDataDto updateDossierPreGeneration(DossierDataCoreDto dossier) {
		dossierDataHelper.purgeNonUpdatableDossierFields(dossier);

		// Get the current dossier status => get value of OnSuccessTarget(the status of the dossier in case its ok)
		RefStatusDto currentStatus = referentialService.getStatusByCode(dossier.getCodeStatus())
				.orElseThrow(()-> new TechnicalException("No status found for code: " + dossier.getCodeStatus()));
		RefStatusDto nextStatus = currentStatus.getOnSuccessTarget();
		dossier.setCodeStatus(nextStatus.getCode());
		DossierDataCoreDto newDossierDataDto = dossierDataClient.update(dossier.getUuid(), dossier);
		return dossierDataDtoMapper.convertToApiDTO(newDossierDataDto);
	}

	/**
	 * The purpose of this method is to calculate the monthly installement
	 *
	 * @param dossierDataCoreDto an object containing the core data for a loan
	 *                           application
	 */
	public void getMonthlyInstallment(DossierDataCoreDto dossierDataCoreDto) {
		if (dossierDataCoreDto == null || dossierDataCoreDto.getLoanData() == null) return;

		LoanDataCoreDto loanData = dossierDataCoreDto.getLoanData();
		String codePeriodicity = loanData.getCodePeriodicity();
		if (codePeriodicity == null) {
			loanData.setMonthlyInstallment(BigDecimal.ZERO);
			return;
		}

		referentialService.getPeriodicityByCode(codePeriodicity).ifPresent(p -> {
			Short periodicity = p.getPeriodicity();
			if (periodicity == null) {
				loanData.setMonthlyInstallment(BigDecimal.ZERO);
				return;
			}

			String productCode = dossierDataCoreDto.getCodeProduct();
			Set<String> mecanisms = loanData.getCodeMechanisms();
            Map<String, LoanSegment> segments = buildSegments(loanData, productCode, mecanisms);

			BigDecimal totalInstallment = segments.values().stream()
                    .map(segment -> calculateSegmentInstallment(segment, periodicity))
					.reduce(BigDecimal.ZERO, BigDecimal::add);

			if (segments.isEmpty()) {
				BigDecimal amount = loanData.getLoanAmount();
				Double rate = loanData.getRate();
				Integer duration = loanData.getDeadlineNumber();
				if (amount != null && amount.compareTo(BigDecimal.ZERO) > 0 && rate != null && rate > 0 && duration != null && duration > 0 && periodicity > 0) {
					totalInstallment = calculateMonthlyInstallment(amount, rate, duration, periodicity);
				}
			}

			loanData.setMonthlyInstallment(totalInstallment.setScale(2, RoundingMode.HALF_UP));
		});
	}

	private BigDecimal calculateSegmentInstallment(LoanSegment segment, Short periodicity) {
		if (segment.getAmount() == null || segment.getDuration() == null || segment.getRate() == null) {
			return BigDecimal.ZERO;
		}
		if (segment.getAmount().compareTo(BigDecimal.ZERO) > 0 && segment.getDuration() > 0 && segment.getRate().compareTo(BigDecimal.ZERO) > 0) {
			return calculateMonthlyInstallment(segment.getAmount(), segment.getRate().doubleValue(), segment.getDuration(), periodicity);
		}
		return BigDecimal.ZERO;
	}

    private Map<String, LoanSegment> buildSegments(LoanDataCoreDto loanData, String productCode, Set<String> mecanisms) {
        Map<String, LoanSegment> segments = new HashMap<>();

        if (isAdlSakane(productCode)) {
            addIfMechanism(segments, mecanisms, "TYPEA",
                    "typeA", loanData.getTypeAloanAmount(), loanData.getTypeAloanRate(), loanData.getTypeAloanDuration());
            addIfMechanism(segments, mecanisms, "TYPEB",
                    "typeB", loanData.getTypeBloanAmount(), loanData.getTypeBloanRate(), loanData.getTypeBloanDuration());
        }

        if (isImtilak(productCode)) {
            addIfMechanism(segments, mecanisms, "MCN1",
                    "subsidized", loanData.getSubsidizedCreditAmount(), loanData.getSubsidizedCreditRate(), loanData.getSubsidizedCreditDuration());
            addIfMechanism(segments, mecanisms, "MCN1",
                    "additional1", loanData.getAdditionalCredit(), loanData.getAdditionalCreditRate(), loanData.getAdditionalLoanDuration());

            addIfMechanism(segments, mecanisms, "MCN2",
                    "bonus", loanData.getBonusCreditAmount(), loanData.getBonusCreditRate(), loanData.getBonusCreditDuration());
            addIfMechanism(segments, mecanisms, "MCN2",
                    "additional2", loanData.getAdditionalCredit(), loanData.getAdditionalCreditRate(), loanData.getAdditionalLoanDuration());

            addIfMechanism(segments, mecanisms, "MCN3",
                    "supported", loanData.getSuportedCreditAmount(), loanData.getSuportedCreditRate(), loanData.getSuportedCreditDuration());
        }

        if (isSalafBaytiSante(productCode)) {
            addIfMechanism(segments, mecanisms, "MCN2",
                    "bonus", loanData.getBonusCreditAmount(), loanData.getBonusCreditRate(), loanData.getBonusCreditDuration());
            addIfMechanism(segments, mecanisms, "MCN2",
                    "additional2", loanData.getAdditionalCredit(), loanData.getAdditionalCreditRate(), loanData.getAdditionalLoanDuration());
        }

        return segments;
    }

    private void addIfMechanism(Map<String, LoanSegment> segments,
                                Set<String> mecanisms,
                                String requiredMechanism,
                                String key,
                                BigDecimal amount,
                                BigDecimal rate,
                                Integer duration) {
        if (mecanisms.contains(requiredMechanism)) {
            segments.put(key, LoanSegment.builder().amount(amount).rate(rate).duration(duration).build());
        }
    }

	private void addIfMechanism(Map<String, LoanSegment> segments,
								Set<String> mecanisms,
								String requiredMechanism,
								String key,
								BigDecimal amount,
								Double rate,
								Integer duration) {
		if (mecanisms.contains(requiredMechanism)) {
			segments.put(key, LoanSegment.builder().amount(amount).rate(normalizeRate(rate)).duration(duration).build());
		}
	}

    private BigDecimal normalizeRate(Double rate) {
		if(rate != null) {
			return BigDecimal.valueOf((rate));
		}
        return null;
    }

    private boolean isAdlSakane(String code) {
		return "ADL_SAKANE".equals(code) || "ADL_SAKANE_PPR".equals(code);
	}

	private boolean isImtilak(String code) {
		return "IMTILAK".equals(code) || "IMTILAK_PPR".equals(code);
	}

	private boolean isSalafBaytiSante(String code) {
		return "SALAF_BAYTI_SANTE".equals(code) || "SALAF_BAYTI_SANTE_PPR".equals(code);
	}

	/**
	 * The purpose of this method is to apply the equation on loan params Equation :
	 * (Loan Amount * ( Rate / Periodicity)) / (1- ( 1 +( Rate / Periodicity)) ^ -
	 * Dead Line)
	 *
	 * @param loanAmount     the total amount of the loan being requested
	 * @param rate           the annual interest rate of the loan
	 * @param deadLineNumber the number of payment periods over which the loan is
	 *                       being repaid.
	 * @param periodicity    the number of payment periods per year per 4 months or
	 *                       6 months
	 * @return monthlyInstallment
	 */
	public BigDecimal calculateMonthlyInstallment(BigDecimal loanAmount, Double rate, Integer deadLineNumber,
												  Short periodicity) {

		double tvaFormatted = Double.parseDouble("1."+ (tva != null ? tva : "10"));

		if (loanAmount == null || rate == null || deadLineNumber == null || periodicity == null || periodicity <= 0)
			return BigDecimal.ZERO;

		// Rate / Periodicity
		double eq0 = ( rate * tvaFormatted ) / ( periodicity * 100 );

		// (Loan Amount * ( Rate / Periodicity))
		BigDecimal eq1 = loanAmount.multiply(BigDecimal.valueOf(eq0));

		// (1- ( 1 +( Rate / Periodicity)) ^ - Dead Line)
		BigDecimal eq2 = BigDecimal.valueOf(1 - Math.pow(1 + eq0, -deadLineNumber));

		if (eq2.compareTo(BigDecimal.ZERO) <= 0)
			return BigDecimal.ZERO;

		// (Loan Amount * ( Rate / Periodicity)) / (1- ( 1 +( Rate / Periodicity)) ^ -
		// Dead Line)
		return eq1.divide(eq2, 2, RoundingMode.HALF_UP);
	}

	private void handleComment(CommentDto comment, UserDto user, DossierDataCoreDto dossier) {
		if(comment != null && comment.getMessage()!=null) {
			comment.setMessage(comment.getMessage().concat(" " + user.getFullName()));
			dossierDataHelper.fillComment(comment, dossier);
		}
	}

	private String getProductLabel(DossierDataCoreDto dossier) {
		if (dossier != null) {
			return referentialService.getProductByCode(dossier.getCodeProduct())
					.map(RefProductDto::getDesignation)
					.orElse(null);
		}
		return null;
	}

	private TaskResult getCurrentUserTask(String dossierUuid) {
		return ppWorkflowService.getCurrentTask(UserHelper.getCurrentUser().getIdentifier(), dossierUuid);
	}

	private void recalculateLoanAmounts(DossierDataDto dossier) {
		LoanDataDto loanData = dossier.getLoanData();

		loanData.setLoanAmount(calculateLoanAmount(loanData));
		loanData.setInvestmentAmount(calculateInvestmentAmount(loanData));
		loanData.setApport(calculateApport(loanData));
        loanData.setPercentOfApport(calculatePercentOfApport(loanData));
        loanData.setApplicationFee(calculateApplicationFee(loanData));
	}

	private void recalculateRates(DossierDataDto dossier) {
		LoanDataDto loanData = dossier.getLoanData();
		if (!ApplicationConstants.LOAN_RATE_TYPE_CAPED_CODE.equals(loanData.getRateType().getCode())) {
			loanData.setCappedRate(null);
		}
	}

	private List<String> getTaskUuids(List<TaskResult> tasks){
		String currentUserIdentifier = UserHelper.getCurrentUser().getIdentifier();
		String currentUserProfessionCode = UserHelper.getCurrentUser().getCodeProfession();
		String currentUserMatricule = UserHelper.getCurrentUser().getMatricule();
		PoolDossierDto poolDossier = referentialService.getVirtualProfInPoolDossier(currentUserMatricule);
		String mappedProfessionCode = (poolDossier != null)
				? poolDossier.getVirtualProfession()
				: currentUserProfessionCode;
		List<TaskResult> userTasks = ppWorkflowService.getUserTasks(currentUserIdentifier, mappedProfessionCode);
		tasks.addAll(userTasks);
		log.info("Task list size:{} , user: {} profession: {}",userTasks.size(), currentUserIdentifier, currentUserProfessionCode );
		return userTasks.parallelStream()
				.map(TaskResult::getCaseInstanceId)
				.collect(Collectors.toList());
	}
	
	private void setBackDossierCriteria(DossierDataCriteria dossierDataCriteria, String codeProfession) {
        dossierDataCriteria.setWithoutPool(Boolean.TRUE);
        if(RSTC.name().equals(codeProfession)){
            dossierDataCriteria.setReachedStatus(DossierStatus.DSC_OPC_GENERATION_PROCESSING.getCode());
        }else{
            DossierStatus.getStatusTTY().addAll(Arrays.asList(DossierStatus.FULL_RELEASE.getCode(), DossierStatus.PARTIAL_RELEASE.getCode()));
            dossierDataCriteria.setNotInStatus(DossierStatus.getStatusTTY());
        }
	}

	private void setKeywordFilters(DossierDataCriteria dossierDataCriteria, String keyword){
		if(keyword != null){
			dossierDataCriteria.setCodeDossier(keyword);
			dossierDataCriteria.setCustomerCode(keyword);
			dossierDataCriteria.setLastName(keyword);
			dossierDataCriteria.setFirstName(keyword);
			List<RefStatusDto> allStatus = getAllStatus();
			dossierDataCriteria.setStatus(getStatusByDesignation(keyword, allStatus));
			dossierDataCriteria.setStatusOfStage(getStatusByStage(keyword, allStatus));
		}
	}

	private void setEntityParams(DossierDataCriteria dossierDataCriteria){
		if (Arrays.asList(DossierListEnum.ALL_INPROGRESS_TASKS, DossierListEnum.ALL_RETURNED_TASKS).contains(dossierDataCriteria.getListType())
				&& !DossierUserEntity.ACR.toString().equals(dossierDataHelper.getCurrentuser().getCodeProfession())) return;

		RequestStatisticsDossier requestStatisticsDossier = RequestStatisticsDossier.builder()
				.entity(dossierDataHelper.getEntity(dossierDataHelper.getCurrentuser()))
				.codeEntity(dossierDataHelper.getEntityCode(dossierDataHelper.getCurrentuser()))
				.matricule(dossierDataHelper.getCurrentuser().getMatricule())
				.build();
		dossierDataCriteria.setEntityParams(requestStatisticsDossier);
	}

	private SearchRequest<DossierDataCriteria> prepareQueryParams(SearchRequest<DossierDataCriteria> searchRequest, List<TaskResult> userTasks){
		DossierListEnum listType = searchRequest.getSearchCriteria().getListType();
		DossierDataCriteria dossierDataCriteria= searchRequest.getSearchCriteria();
		String keyword = dossierDataCriteria.getSearchKeyword();
		UserDto user = ApplicationContextHolder.getUserContext().getUser();
		switch (listType){
			case ALL_DOSSIERS_IN_POOL:
				List<String> uuids = getTaskUuids(userTasks);
				if(!CollectionUtils.isEmpty(uuids)) {
					dossierDataCriteria.setNotInlistUuidDossier(uuids);
				}
				dossierDataCriteria.setInStatus(dossierDataHelper.getStatusPool(user.getCodeProfession()));
				break;
			case ALL_INPROGRESS_TASKS:
				dossierDataCriteria.setNotInStatus(DossierStatus.getStatusReturned());
				dossierDataCriteria.setInlistUuidDossier(getTaskUuids(userTasks));
				setEntityParams(dossierDataCriteria);
				break;
			case ALL_RETURNED_TASKS:
				dossierDataCriteria.setInStatus(DossierStatus.getStatusReturned());
				dossierDataCriteria.setInlistUuidDossier(getTaskUuids(userTasks));
				setEntityParams(dossierDataCriteria);
				break;
			case ALL_DOSSIERS:
				List<String> taskUuids = getTaskUuids(userTasks);
				if(!CollectionUtils.isEmpty(taskUuids)) {
					dossierDataCriteria.setNotInlistUuidDossier(taskUuids);
				}
				setEntityParams(dossierDataCriteria);
				dossierDataCriteria.setEligibleMarketCodes(getUserMarketCodes());
				dossierDataCriteria.setDossierTaskStatus(getDossierTaskStatus());
				break;
			case ALL_RELEASED_DOSSIERS:
				dossierDataCriteria.setInStatus(List.of(DossierStatus.FULL_RELEASE.getCode()));
				setEntityParams(dossierDataCriteria);
				break;
			case ALL_DOSSIERS_BACK:
				setBackDossierCriteria(dossierDataCriteria,user.getCodeProfession());
				break;
			case ALL_DOSSIERS_FRONT:
			case ALL_DOSSIERS_FRONT_HAS_REQUEST:
				dossierDataCriteria.setInStatus(DossierStatus.getStatusTTY());
				dossierDataCriteria.setHasRequest(DossierListEnum.ALL_DOSSIERS_FRONT_HAS_REQUEST.equals(listType));
				setEntityParams(dossierDataCriteria);
				break;
		}

		setKeywordFilters(dossierDataCriteria, keyword);
		searchRequest.setSearchCriteria(dossierDataCriteria);
		return searchRequest;
	}

	private String getDossierTaskStatus() {
		UserDto currentuser = dossierDataHelper.getCurrentuser();
		if(List.of(ProfessionCode.DMR.name(),ProfessionCode.RSTC.name()).contains(currentuser.getCodeProfession()))
			return DossierStatus.DSC_OPC_GENERATION_PROCESSING.getCode();
		return null;
	}

	private List<String> getUserMarketCodes() {
		UserDto currentUser = UserHelper.getCurrentUser();
		List<String> userMarketCodes = new ArrayList<>(currentUser.getProfessionMarketsCodes());
		if ("ARR".equals(currentUser.getCodeProfession())) {
			List<String> analystesRisquePat = referentialService.getAnalystesRisquePat();
			if (!CollectionUtils.isEmpty(analystesRisquePat) && analystesRisquePat.contains(currentUser.getMatricule())) {
				userMarketCodes.add("09");
			}
		}
		return userMarketCodes;
	}


	private void setPoolCandidate(DossierDataDto dossierDataDto, TaskResult taskResult) {
		final Map<String,String> ALLOWED_WORKFLOW_ACTIVITIES = new HashMap<>();

		ALLOWED_WORKFLOW_ACTIVITIES.put("request_expertise","CTB_EXPASS");

		if (dossierDataDto == null || taskResult == null) return;

		String codeStatus = dossierDataDto.getCodeStatus();
		String userProfession = UserHelper.getCurrentUser().getCodeProfession();
		String currentUserMatricule = UserHelper.getCurrentUser().getMatricule();
		PoolDossierDto poolDossier = referentialService.getVirtualProfInPoolDossier(currentUserMatricule);
		String mappedProfessionCode = (poolDossier != null)
				? poolDossier.getVirtualProfession()
				: userProfession;
		final String activityName = taskResult.getActivityName();
		final boolean isAllowedWorkflow = ALLOWED_WORKFLOW_ACTIVITIES.containsKey(activityName);
		final boolean isNotAssigned = taskResult.getAssignee() == null && taskResult.getVariables() != null;
		if (isAllowedWorkflow) {
			boolean isCorrectPrefession = ALLOWED_WORKFLOW_ACTIVITIES.get(activityName).equals(UserHelper.getCurrentUser().getCodeProfession());
			dossierDataDto.setPoolCandidate(isNotAssigned && isCorrectPrefession);
			return;
		}

		if (!DossierStatus.getPoolStatus().contains(codeStatus) || !POOL_GROUPS.containsKey(codeStatus)) return;

		String workflowConstant = POOL_GROUPS.get(codeStatus);
		boolean isPoolCandidate = DossierStatus.DECISION_RISK.getCode().equals(codeStatus)
			? Arrays.asList(taskResult.getVariables().getOrDefault(workflowConstant, "").replaceAll("\\s", "").split(",")).contains(mappedProfessionCode)
			: taskResult.getVariables().getOrDefault(workflowConstant, "").equals(mappedProfessionCode);

		dossierDataDto.setPoolCandidate(isNotAssigned && isPoolCandidate);
	}

	public boolean controlDossier(DossierDataDto dossierDataDto, boolean isMandatoryErrorBlocked) {
		Class[] groups;
		boolean isProspect = dossierDataDto.getCustomerData() != null &&
				dossierDataDto.getCustomerData().getPersonalInfo() != null &&
				Boolean.TRUE.equals(dossierDataDto.getCustomerData().getPersonalInfo().isProspect());

		groups = isProspect
				? new Class[]{ProspectValidationGroup.class}
				: new Class[]{MandatoryValidationGroup.class, FunctionalValidationGroup.class};

		Map<Class<?>, Set<ValidationErrorDto>> violationMessages = validationService.validateByGroup(dossierDataDto, groups);

		if (violationMessages.get(FunctionalValidationGroup.class) != null) {
			Set<ValidationErrorDto> set = violationMessages.get(FunctionalValidationGroup.class);
			throw ValidationException.builder().errors(set)
					.build();
		}

		if (isMandatoryErrorBlocked && violationMessages.get(MandatoryValidationGroup.class) != null) {
			Set<ValidationErrorDto> set = violationMessages.get(MandatoryValidationGroup.class);
			throw ValidationException.builder().errors(set)
					.build();
		}


		if (isMandatoryErrorBlocked && violationMessages.get(ProspectValidationGroup.class) != null) {
			Set<ValidationErrorDto> set = violationMessages.get(ProspectValidationGroup.class);
			throw ValidationException.builder().errors(set)
					.build();
		}

		return violationMessages.get(MandatoryValidationGroup.class) == null;
		}

	private void completeDossier(DossierDataDto dossierDataDto) {
		if (dossierDataDto.getCustomerData() != null && dossierDataDto.getCustomerData().getCustomerCode() != null &&  dossierDataDto.getCustomerData().getPersonalInfo()!=null) {
			IndividualCustomerDTO customerData = dossierDataDto.getCustomerData();
			BalanceActivityDTO customerBalanceActivity = customerService.getCustomerBalanceActivity(customerData);
			boolean customerAProspect = customerService.isCustomerAProspect(customerBalanceActivity.getAccountNumber(),customerData.getPersonalInfo().getCreationDate());
			customerData.setProspect(customerAProspect);
			customerData.setBalanceActivity(customerBalanceActivity);
			customerData.setBlueCardHolder(isBlueCardHolder(customerData.getCustomerCode(),customerBalanceActivity.getAccountNumber()));
			dossierDataDto.setCustomerData(customerData);
		}

		// set status for flag attribute to call external debts
		Optional.ofNullable(dossierDataDto.getLoanData())
				.ifPresent(l -> {
					l.setIsExternDebtsRetrieved(Boolean.FALSE);
					if (CollectionUtils.isEmpty(dossierDataDto.getDebtsinfon())) {
						l.setIsExternDebtsInfnRetrieved(Boolean.FALSE);
					}
				});

		dossierDataDto.setCodeStatus(DossierStatus.INITIATION.getCode());
	}

	private boolean isBlueCardHolder(String customerCode, String rib) {
		log.info("Checking Blue Card for customer={} ribs={}", customerCode, rib);

		if ( customerCode == null || customerCode.isBlank() || rib == null || rib.isEmpty()) {

			log.error("'customerCode':{} must be non-null/non-blank and 'rib':{} must be non-null/non-blank", customerCode,rib);
			throw new TechnicalException("'customerCode' must be non-null/non-blank and 'ribs' must be non-null/non-blank");

		}
		List<ContractPackResponseDto.PackContent> packContents = List.of();

		try {
			log.info("Start Calling contracts intaj packs for customer={} ribs={}", customerCode, rib);
			ContractPacksRequestDto request = ContractPacksRequestDto.builder()
					.customerId(customerCode)
					.ribs(List.of(rib))
					.build();

			ContractPackResponseDto response = contractPackClient.getPacks(request);

			log.info("End Calling contracts intaj packs for customer={} ribs={}", customerCode, rib);
			log.debug("Response from contractPackClient: {}", response);

			packContents = Optional.ofNullable(response)
					.map(ContractPackResponseDto::getContent)
					.orElse(List.of());

		} catch (Exception e) {
			log.error("Failed to retrieve packs for customer={} rib={}, error={}", customerCode, rib, e.getMessage(), e);
			return false;
		}

		List<String> blueCardProductCodesList = List.of(blueCardProductCodes);
		boolean holder = packContents.stream()
				.map(ContractPackResponseDto.PackContent::getPackProductCode)
				.anyMatch(blueCardProductCodesList::contains);

		log.info("Customer {} isBlueCardHolder = {}", customerCode, holder);
		return holder;
	}


	private  Boolean  isRetriesReturnDecisionInstance(List<DossierReturnDecisionDto> retries, String  dossierCodeStage) {
		if (retries==null) return false;
		return 	retries.stream().filter(opt -> opt.getStatusDossier().equals(dossierCodeStage)).count() < maxRetry;
	}

	@Override
	public DossierDataDto sendExpertiseRequest(String uuid, CommentDto commentDto) throws Exception {
		DossierDataCoreDto dossier = dossierDataClient.retrieveByUuid(uuid);
		dossier.setHasTaskExpertise(false);
		dossierDataClient.update(uuid, dossier);
		return this.advanceDossier(dossier, WorkflowTaskCompletionDto.builder()
				.operationResult(WorkflowValidationResult.VALID).comment(commentDto).build());
	}

	public Boolean checkAttachmentTypeIsMandatory(String code, DossierDataCoreDto dossier, Map<String, RefAttachmentTypeStatusDto> mapAttachmentTypeStatus, String taskStatus) {
		if (!dossier.getCodeStatus().equals(taskStatus) &&  TASK_STATUS_MAP.containsKey(taskStatus)) {
			return TASK_STATUS_MAP.get(taskStatus).equals(code);
		}
		RefAttachmentTypeStatusDto refAttachmentTypeStatusDto = mapAttachmentTypeStatus.get(code);
		if (refAttachmentTypeStatusDto==null) return false;

		if (CollectionUtils.isEmpty(refAttachmentTypeStatusDto.getRules())) return refAttachmentTypeStatusDto.isMandatory();
		List<RefAttachmentRuleDto> rules = getRulesByAttachmentTypeRule(refAttachmentTypeStatusDto.getRules(), AttachmentRuleType.MANDATORY);
		if (CollectionUtils.isEmpty(rules)) return refAttachmentTypeStatusDto.isMandatory();

		return checkAllRulesAreValid(dossier, rules);
	}

	public boolean isAttachmentTypeValid(RefAttachmentTypeDto attachmentType, DossierDataCoreDto dossier) {
		if (attachmentType == null) return false;
		if (attachmentType.getRules() == null) return true;
		List<RefAttachmentRuleDto> rules = getRulesByAttachmentTypeRule(attachmentType.getRules(), AttachmentRuleType.VISIBILITY);

		if (rules.isEmpty()) {
			return true;
		}
		return checkAllRulesAreValid(dossier, rules);
	}

	private  List<RefAttachmentRuleDto> getRulesByAttachmentTypeRule(List<RefAttachmentRuleDto> rules ,AttachmentRuleType ruleType) {
		Predicate<RefAttachmentRuleDto> predicate = refAttachmentRuleDto -> ruleType.equals(refAttachmentRuleDto.getRuleType());
		return rules.stream().filter(predicate)
				.collect(Collectors.toList());
	}
	private boolean checkAllRulesAreValid(DossierDataCoreDto dossier, List<RefAttachmentRuleDto> rules) {
		boolean isValid = true;
		for (RefAttachmentRuleDto rule : rules) {
			if (Boolean.FALSE.equals(isRuleValid(rule, dossier))) {
				isValid = false;
				break;
			}
		}
		return isValid;
	}

	public boolean isRuleValid(RefAttachmentRuleDto attachmentRule, DossierDataCoreDto dossier) {
		try {
			Object currentValue;
			String expectedValue = attachmentRule.getExpectedValue();
			AttachmentRuleOperator operator = AttachmentRuleOperator.valueOf(attachmentRule.getOperator());
			if (AttachmentRuleOperator.ANY_EQUALS.equals(operator)) {
				return evaluateAnyEquals(attachmentRule,dossier);
			}else if (AttachmentRuleOperator.ALL_EQUALS.equals(operator)){
				return evaluateAllEquals(attachmentRule,dossier);
			}

			currentValue = ObjectUtils.getObjectPropertyValue(dossier, attachmentRule.getFieldname());

			return evaluateRule(currentValue, expectedValue, operator);
		} catch (Exception e) {
			log.error("error evaluating attachment rule", e);
		}
		return false;
	}

	private boolean evaluateAllEquals(RefAttachmentRuleDto attachmentRule, DossierDataCoreDto dossier) throws InvocationTargetException, IllegalAccessException, NoSuchMethodException {
		Object currentValue = ObjectUtils.getObjectPropertyValue(dossier,
				attachmentRule.getFieldname().split(ObjectUtils.PROPERTY_NAME_SEPARATOR_REGX)[0]);
		String expectedValue = attachmentRule.getExpectedValue();
		Collection<Object> listValues = (Collection<Object>) currentValue;
		if (listValues != null && !listValues.isEmpty()) {
			for (Object object : listValues) {
				Object value = BeanUtilsBean.getInstance().getPropertyUtils().getProperty(object,
						attachmentRule.getFieldname().split(ObjectUtils.PROPERTY_NAME_SEPARATOR_REGX)[1]);
				if (!expectedValue.equalsIgnoreCase(value.toString())) {
					return false;
				}
			}
			return true;
		}
		return false;
	}

	private boolean evaluateAnyEquals(RefAttachmentRuleDto attachmentRule, DossierDataCoreDto dossier) throws InvocationTargetException, IllegalAccessException, NoSuchMethodException {
		Object currentValue = ObjectUtils.getObjectPropertyValue(dossier,
				attachmentRule.getFieldname().split(ObjectUtils.PROPERTY_NAME_SEPARATOR_REGX)[0]);
		String expectedValue = attachmentRule.getExpectedValue();
		Collection<Object> listValues = (Collection<Object>) currentValue;
		if (listValues != null && !listValues.isEmpty()) {
			for (Object object : listValues) {
				Object value = BeanUtilsBean.getInstance().getPropertyUtils().getProperty(object,
						attachmentRule.getFieldname().split(ObjectUtils.PROPERTY_NAME_SEPARATOR_REGX)[1]);
				if (expectedValue.equalsIgnoreCase(value.toString())) {
					return true;
				}
			}
		}
		return false;
	}

	public boolean evaluateRule(Object currentValue, String expectedValue, AttachmentRuleOperator operator) {
		switch (operator) {
			case EQUALS:
				return currentValue != null ? expectedValue.equalsIgnoreCase(currentValue.toString())
						: expectedValue == null;
			case IN:
				return currentValue != null ? Arrays.stream(expectedValue.split(",", -1)).anyMatch(currentValue::equals)
						: expectedValue == null;
			case NOT_IN:
				return currentValue != null ? !Arrays.stream(expectedValue.split(",", -1)).anyMatch(currentValue::equals)
						: expectedValue != null;
			case NOT_EMPTY:
				return currentValue instanceof Collection && !Collection.class.cast(currentValue).isEmpty();
			case NOT_EQUALS:
				return currentValue != null ? !expectedValue.equalsIgnoreCase(currentValue.toString())
						: expectedValue != null;
			case NOT_NULL:
				return currentValue != null && !(currentValue instanceof BigDecimal && ((BigDecimal) currentValue).doubleValue() == 0);
			case NULL:
				return currentValue == null;
			default:
				return false;
		}
	}


    private WarrantyDto warranty(String template, String code, Object... args) {
        return WarrantyDto.builder().code(code).content(String.format(template, args)).type(WarrantyType.AUTO).build();
    }
	public void generateDefaultWarranties(DossierDataCoreDto dossier) {
		if (dossier == null) return;
		if(!CollectionUtils.isEmpty(dossier.getWarranties())) dossier.getWarranties().removeIf(w-> WarrantyType.AUTO.equals(w.getType()));
		List<WarrantyDto> defaultWarranties = new ArrayList<>();

		List<BeneficiaryCoreDto> beneficiaries = Optional.ofNullable(dossier.getBeneficiaries()).orElse(Collections.emptyList());
		List<GuarantorCoreDto> guarantors = Optional.ofNullable(dossier.getGuarantors()).orElse(Collections.emptyList());
		LoanDataCoreDto loanData = dossier.getLoanData();
		String productCode = dossier.getCodeProduct();

		boolean hasEmprunteur = beneficiaries.stream().anyMatch(b -> Boolean.TRUE.equals(b.getIsBorrower()));
		boolean hasOtherBeneficiaries = beneficiaries.stream().anyMatch(b -> Boolean.FALSE.equals(b.getIsBorrower()));
		boolean hasCaution = !guarantors.isEmpty();

		if (loanData != null) {
			defaultWarranties.add(warranty(WARRANTY_DECES_INVAL, CODE_DECES_INVAL, loanData.getLoanAmount()));
		}

		if (hasCaution && loanData != null) {
			guarantors.forEach(g -> defaultWarranties.add(warranty(WARRANTY_CAUTION_SOLIDAIRE,
					CODE_CAUTION_SOLIDAIRE, (g.getFirstName() + " " + g.getLastName()), loanData.getLoanAmount())));
		}

		if (loanData != null && "TRN".equals(loanData.getCodePropertyType())) {
			defaultWarranties.add(warranty(WARRANTY_CONFORT_HAB,CODE_CONFORT_HAB, loanData.getLoanAmount()));
		}

		addWarrantiesForSpecificProducts(defaultWarranties, productCode);
		addPropertyWarranties(dossier, defaultWarranties, productCode, hasEmprunteur, hasOtherBeneficiaries);
		addMarketWarranties(dossier, defaultWarranties, hasEmprunteur);

		if (dossier.getWarranties() == null) dossier.setWarranties(new ArrayList<>());
		dossier.getWarranties().addAll(defaultWarranties);
	}

	private void addMarketWarranties(DossierDataCoreDto dossier, List<WarrantyDto> defaultWarranties, boolean hasEmprunteur) {
		if (!hasEmprunteur || dossier.getCustomerData() == null || dossier.getCustomerData().getCard() == null) return;
		String market = Optional.ofNullable(dossier.getCustomerData().getCard().getMarket()).orElse("");

		if (market.contains(MCH_01) || market.contains(MCH_09_PRI)) {
			defaultWarranties.add(warranty(WARRANTY_DOM_SALAIRE, CODE_DOM_SALAIRE));
		} else if (market.contains(MCH_02) || market.contains(MCH_03) || market.contains(MCH_09_PRO)) {
			defaultWarranties.add(warranty(WARRANTY_DOM_REVENUS, CODE_DOM_REVENUS));
		}
	}

	private void addPropertyWarranties(DossierDataCoreDto dossier, List<WarrantyDto> list, String productCode, boolean hasEmprunteur, boolean hasOtherBeneficiaries) {
		Set<String> excluded = Set.of(ProductCode.PPI_VEFA_RESIDENT.toString(), ProductCode.PPI_ENGAGEMENT_PROMOTEUR.toString(), ProductCode.MOULKIA.toString());
		if (dossier.getCodeProduct() == null || excluded.contains(dossier.getCodeProduct()) || dossier.getPropertyData() == null) return;

		Optional.ofNullable(dossier.getPropertyData().getProperties()).orElse(Collections.emptyList()).forEach(p -> {
			Optional.ofNullable(p.getRangs()).orElse(Collections.emptyList()).forEach(r -> {
				if (hasEmprunteur) list.add(warranty(WARRANTY_HYPOTHEQUE, CODE_HYPOTHEQUE, r.getRang(), p.getLandCertificateNumber(), r.getWarrantyAmount()));
				if (hasOtherBeneficiaries) list.add(warranty(WARRANTY_CAUTION_HYPO, CODE_CAUTION_HYPO, r.getRang(), p.getLandCertificateNumber(), r.getWarrantyAmount()));
			});
		});
	}

	private void addWarrantiesForSpecificProducts(List<WarrantyDto> list, String productCode) {
		if (productCode == null) return;
		if (conventionProducts.contains(productCode)) {
			list.add(warranty(WARRANTY_ACCORD_FOND, CODE_ACCORD_FOND));
		}
		if (List.of(ProductCode.FOGALOGE.toString(), ProductCode.FOGARIM.toString()).contains(productCode)) {
			list.add(warranty(WARRANTY_ACCEPT_CCG, CODE_ACCEPT_CCG));
		}
	}

}
