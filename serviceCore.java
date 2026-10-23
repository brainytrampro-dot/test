package ma.sg.its.octroicreditcore.service;

import lombok.AllArgsConstructor;
import lombok.NoArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import ma.sg.its.octroicreditcore.Specification.DossierKpiSpecification;
import ma.sg.its.octroicreditcore.dto.*;
import ma.sg.its.octroicreditcore.dto.kpi.KpiDossierData;
import ma.sg.its.octroicreditcore.enumeration.DossierListEnum;
import ma.sg.its.octroicreditcore.enumeration.DossierStatus;
import ma.sg.its.octroicreditcore.enumeration.RequestStatus;
import ma.sg.its.octroicreditcore.enumeration.AccordType;
import ma.sg.its.octroicreditcore.exception.TechnicalException;
import ma.sg.its.octroicreditcore.mapper.*;
import ma.sg.its.octroicreditcore.mapper.kpi.KpiDataMapper;
import ma.sg.its.octroicreditcore.model.*;
import ma.sg.its.octroicreditcore.model.comments.Comment;
import ma.sg.its.octroicreditcore.repository.*;
import ma.sg.its.octroicreditcore.strategy.DossierCreation;
import ma.sg.its.octroicreditcore.strategy.DossierCreationContext;
import ma.sg.its.octroicreditcore.strategy.DossierCreationHelper;
import ma.sg.its.octroicreditcore.util.Assert;
import org.apache.commons.collections.CollectionUtils;
import org.apache.commons.lang.ObjectUtils;
import org.apache.commons.lang.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.*;
import java.util.function.Predicate;
import java.util.stream.Collectors;

import static ma.sg.its.octroicreditcore.constant.ErrorsConstants.CANNOT_PERFORM_THIS_ACTION;
import static ma.sg.its.octroicreditcore.constant.ErrorsConstants.DOSSIER_NOT_EXIST;
import static org.springframework.transaction.annotation.Isolation.REPEATABLE_READ;

@Service
@Transactional
@Slf4j
@AllArgsConstructor
@NoArgsConstructor
public class DossierDataService {

	public static final String INVALID_OR_NULL_DOSSIER_REQUEST_DTO = "Invalid or null dossier request DTO";
	public static final String AMORTIZABLE_LOAN_OR_DOSSIER_UUID_MUST_BE_NOT_NULL = "Amortizable loan detail Or Dossier uuid must be not null";

	@Autowired
	private DossierDataRepository dossierDataRepository;
	@Autowired
	@Lazy
	private DossierDataService self;

	@Autowired
	private DossierDataMapper dossierDataMapper;

	@Autowired
	private DossierAttachmentTypeService dossierAttachmentTypeService;

	@Autowired
	private CustomerCardRepository customerCardRepository;

	@Autowired
	private UserService userService;

	@Autowired
	private UserMapper userMapper;

	@Autowired
	private DossierUserRepository dossierUserRepository;

	@Autowired
	private DossierUserMapper dossierUserMapper;

	@Autowired
	private DebtRepository debtRepository;

	@Autowired
	private DebtInfonRepository debtInfonRepository;

	@Autowired
	private DebtService debtService;

	@Autowired
	private DossierRequestRepository dossierRequestRepository;

	@Autowired
	private  ReassignmentRequestMapper reassignmentRequestMapper;

	@Autowired
	private  ReassignmentRequestRepository reassignmentRequestRepository;

	@Autowired
	private DossierKpiSpecification<DossierKpiView> dossierKpiSpecification;

	@Autowired
	private KpiDataMapper kpiDataMapper;

	@Autowired
	private RequestWarrantyMapper requestWarrantyMapper;

	@Autowired
	private RestrictionMapper restrictionMapper;

	@Autowired
	DossierCreationContext dossierCreationContext;

	@Autowired
	private DossierAttachmentTypeMapper dossierAttachmentTypeMapper;

	@Autowired
	private CustomerMapper customerMapper;

	@Autowired
	private TaskService taskService;

	@Autowired
	private TaskRepository taskRepository;

	@Autowired
	private AmortizableLoanRepository amortizableLoanRepository;

	@Autowired
	private AmortizableLoanMapper amortizableLoanMapper;

	@Autowired
	private RepresentativeMapper representativeMapper;

	@Autowired
	private PropertyMapper propertyMapper;
	@Autowired
	private DossierCreationHelper dossierCreationHelper;

	@Autowired
	private CommentRepository commentRepository;
    @Autowired
    private DossierKpiRefusedViewRepository dossierKpiRefusedViewRepository;
	private static final List<String> TASK_STATUS_CODES = Arrays.asList(
			DossierStatus.OPCV.name(),
			DossierStatus.DECS.name(),
			DossierStatus.TDSC_GEN.name()
	);

	private final static List<String> searchableProperteies = Arrays.asList(
			"numeroDossier", "clientFullname", "designationProduct",
			"marketShorthandGlobal", "loanAmount", "initiator", "assignee", "stage", "status",
			"designation", "drCode", "drppCode", "ucCode", "agencyCode");
    private final static List<String> instructionToDecisionStatus = Arrays.asList("BLOCKED_INIT","INIT","ABND_INST","CTRL","BLOCKED_INCA_VALD",
            "INCA_VALD","ABND_VALD","DECS_RS","NOTIF_RS","AVRS_ANR","AVRS","NOTIF_AVRS","NOTIF_AVRS_ANR","REFU","ABND_DECS","ACCD_RS",
            "DECS_RIDN","NOTIF_RIDN","ABND_RIDN","DECS_RS_FINAL_RIND","DECS_RS_RIND","AVRS_ANR_INCANR_RIDN","AVRS_INCA_RIDN","DECS_ANR_INCA_RIDN",
            "AVRS_ANR_INCA_RIDN","INCA_AVRS","INCA_DECS","ACCD_RIDN","INCA_DECS_RS","INCA_AANR","INCA_AVRS_RANR","AVRS_RANR","ACCD_AVRS",
            "ACCD","INCA_RIDN","DECS_RS_INCA_RIDN","NOTIF_AVRS_RIDN","DECS_RS_FINAL_INCA_RIDN","AANR","AVRS_RIDN","DECS","NOTIF","AVRS_ANR_RIDN","DECS_ANR_RIDN");
	@Autowired
	private GuarantorMapper guarantorMapper;

	public DossierDataDto create(DossierDataDto dossierDto){

		DossierCreation strategy= dossierCreationContext.resolve(dossierDto);
		return strategy.create(dossierDto);
	}

	public void updateProspect(DossierDataDto dossierDataDto, DossierData old) {
		if(old != null){
			customerMapper.updateEntityFromDto(dossierDataDto.getCustomerData(), old.getCustomerData());
			customerCardRepository.save(old.getCustomerData());
		}
	}

	@Transactional(isolation = REPEATABLE_READ)
	public DossierDataDto update(DossierDataDto dossierDto) {
		DossierDataDto dossierDataDto =null;
		try{
			Assert.notNull(dossierDto.getUuid(), CANNOT_PERFORM_THIS_ACTION);
			DossierData oldDossier = dossierDataRepository.findByUuidForupdate(dossierDto.getUuid());
			Assert.exists(oldDossier, DOSSIER_NOT_EXIST);
			DossierData newDossier = convertToEntity(dossierDto);
			if(dossierDto.getCustomerData() != null &&
					dossierDto.getCustomerData().getCustomer() != null &&
					dossierDto.getCustomerData().getCustomer().isProspect() &&
					Arrays.asList(DossierStatus.INIT.toString(), DossierStatus.INCA_VALD.toString()).contains(dossierDto.getCodeStatus())){
				updateProspect(dossierDto, oldDossier);
			}
			if (newDossier.getStatus() != null) {
				oldDossier.setStatus(newDossier.getStatus());
			}
			//TODO change Hardcoded String 022 to properties.local
			if (oldDossier.getLoanData() != null && oldDossier.getLoanData().getIsExternDebtsRetrieved() != null &&
					!oldDossier.getLoanData().getIsExternDebtsRetrieved() && newDossier.getDebts() != null) {
				Predicate<Debt> p = debt -> debt != null && !"022".equals(debt.getEstablishmentCode());
				List<Debt> debtList = newDossier.getDebts().stream().filter(p).collect(Collectors.toList());
				debtRepository.saveAll(debtList);
				oldDossier.getDebts().addAll(debtList);
			}
			if (newDossier.getLoanData() != null
					&& Boolean.TRUE.equals(
					newDossier.getLoanData().getIsExternDebtsInfnRetrieved())
					&& newDossier.getDebtsinfon() != null
					&& !newDossier.getDebtsinfon().isEmpty()) {
				oldDossier.getDebtsinfon().clear();
				debtInfonRepository.saveAll(newDossier.getDebtsinfon());
				oldDossier.getDebtsinfon().addAll(newDossier.getDebtsinfon());
			}



			if (newDossier.getRestrictions() != null && !newDossier.getRestrictions().isEmpty()) {
				Map<Long, Restriction> oldRestrictionsById = oldDossier.getRestrictions().stream()
                        .filter(r -> r.getId() != null)
                        .collect(Collectors.toMap(Restriction::getId, r -> r));
                Set<Long> newRestrictionsIds = newDossier.getRestrictions().stream()
                        .map(Restriction::getId)
                        .filter(Objects::nonNull)
                        .collect(Collectors.toSet());
                oldDossier.getRestrictions().removeIf(r -> r.getId() != null && !newRestrictionsIds.contains(r.getId()));

				List<Restriction> restrictionsToAdd = new ArrayList<>();
				for (Restriction incoming : newDossier.getRestrictions()) {
					Restriction existing = incoming.getId() != null ? oldRestrictionsById.get(incoming.getId()) : null;
					if (existing != null) {
						existing.setContent(incoming.getContent());
						existing.setType(incoming.getType());
						existing.setAttachment(incoming.getAttachment());
					} else {
						restrictionsToAdd.add(incoming);
					}
				}
				oldDossier.getRestrictions().addAll(restrictionsToAdd);
			}


			// Set Debt Ratio (Taux d'endettement) in LoanData
			if (oldDossier.getLoanData() != null && newDossier.getLoanData() != null) {
				Double debtRatio = debtService.getDebtRatio(oldDossier, dossierDto);
				newDossier.getLoanData().setDebtRatio(debtRatio);
			}

			// Set Debt Ratio (Taux d'endettement) in LoanData
			if (newDossier.getLoanData() != null && oldDossier.getLoanData() != null) {
				oldDossier.getLoanData().setIsExternDebtsRetrieved(newDossier.getLoanData().getIsExternDebtsRetrieved());
				oldDossier.getLoanData().setIsExternDebtsInfnRetrieved(newDossier.getLoanData().getIsExternDebtsInfnRetrieved());
			}

			if(Objects.nonNull(newDossier.getCustomerData())&& Objects.nonNull(newDossier.getCustomerData().getCard()) && Objects.nonNull(oldDossier.getCustomerData()) && Objects.nonNull(oldDossier.getCustomerData().getCard())) {
				oldDossier.getCustomerData().getCard().setMarket(newDossier.getCustomerData().getCard().getMarket());
			}

			oldDossier.setInsuranceData((InsuranceData) ObjectUtils.defaultIfNull(newDossier.getInsuranceData(),oldDossier.getInsuranceData()));
			oldDossier.setFinancialData((FinancialData) ObjectUtils.defaultIfNull(newDossier.getFinancialData(),oldDossier.getFinancialData()));
			oldDossier.setLoanData((LoanData) ObjectUtils.defaultIfNull(newDossier.getLoanData(),oldDossier.getLoanData()));
			oldDossier.setCoFinancing((Boolean) ObjectUtils.defaultIfNull(newDossier.getCoFinancing(),oldDossier.getCoFinancing()));
			oldDossier.setEmployer((Employer) ObjectUtils.defaultIfNull(newDossier.getEmployer(),oldDossier.getEmployer()));
			oldDossier.setNotary((Notary) ObjectUtils.defaultIfNull(newDossier.getNotary(),oldDossier.getNotary()));
			oldDossier.setOpcDeliveryDate((LocalDate) ObjectUtils.defaultIfNull(newDossier.getOpcDeliveryDate(),oldDossier.getOpcDeliveryDate()));
			oldDossier.setDateOfReceiptOpcSigned((LocalDate) ObjectUtils.defaultIfNull(newDossier.getDateOfReceiptOpcSigned(),oldDossier.getDateOfReceiptOpcSigned()));
			oldDossier.setMinuteRequestCommitmentDate((LocalDate) ObjectUtils.defaultIfNull(newDossier.getMinuteRequestCommitmentDate(),oldDossier.getMinuteRequestCommitmentDate()));
			oldDossier.setDateOfReceiptMinuteAndCommitment((LocalDate) ObjectUtils.defaultIfNull(newDossier.getDateOfReceiptMinuteAndCommitment(),oldDossier.getDateOfReceiptMinuteAndCommitment()));
			oldDossier.setDateOfReceiptPhysicalFile((LocalDate) ObjectUtils.defaultIfNull(newDossier.getDateOfReceiptPhysicalFile(),oldDossier.getDateOfReceiptPhysicalFile()));
			oldDossier.setFirstReleasedDate(newDossier.getFirstReleasedDate() == null ? oldDossier.getFirstReleasedDate(): newDossier.getFirstReleasedDate());
			oldDossier.setCcgCommessionMatrix((CcgCommessionMatrix) ObjectUtils.defaultIfNull(newDossier.getCcgCommessionMatrix(),oldDossier.getCcgCommessionMatrix()));

			if (newDossier.getComments() != null) {
				Set<String> CommentUUIDs = oldDossier.getComments().stream().map(Comment::getUuid).collect(Collectors.toSet());
				newDossier.getComments().removeIf(comment -> CommentUUIDs.contains(comment.getUuid()));
				oldDossier.getComments().addAll(newDossier.getComments());
			}

			syncWarranties(oldDossier, newDossier);
			Map<String, Beneficiary> beneficiaryPool = new HashMap<>();
			Map<String, Guarantor> guarantorPool = new HashMap<>();
			Map<String, Property> propertyPool = new HashMap<>();

			dossierCreationHelper.syncProperties(dossierDto, oldDossier, propertyPool);
			dossierCreationHelper.syncBeneficiaries(dossierDto, oldDossier, propertyPool, beneficiaryPool);
			dossierCreationHelper.syncGuarantors(dossierDto, oldDossier, guarantorPool);
			dossierCreationHelper.syncRepresentatives(dossierDto, oldDossier, guarantorPool, beneficiaryPool);

			prepareDossier(oldDossier);
			if (dossierDto.getDossierUsers() != null)
				insertDossierUser(dossierDto, oldDossier);

			oldDossier.setAssignee(newDossier.getAssignee());
			oldDossier.setPoolCandidate(newDossier.getPoolCandidate());
			oldDossier.setHasTaskExpertise(newDossier.getHasTaskExpertise());
			oldDossier.setExpertiseTaskAssignee(newDossier.getExpertiseTaskAssignee());
			if(!AccordType.DEFINITIF.equals(oldDossier.getAccord())){
				oldDossier.setAccord(newDossier.getAccord());
			}

			if(newDossier.getProspectUuid()!=null){
				oldDossier.setProspectUuid(newDossier.getProspectUuid());
			}
			if (newDossier.getFlowStatus() != null) {
				oldDossier.setFlowStatus(newDossier.getFlowStatus());
			}
			DossierData updatedData = dossierDataRepository.save(oldDossier);

			dossierDataDto = convertToDto(updatedData);

		} catch (Exception e) {
			log.error("error evaluating attachment rule", e);
			throw new TechnicalException(e.getMessage());
		}
		return dossierDataDto;
	}

	private void syncWarranties(DossierData oldDossier, DossierData newDossier) {
		if (newDossier.getWarranties() == null) {
			oldDossier.getWarranties().clear();
			return;
		}

		List<String> resetStatuses = Arrays.asList(
				DossierStatus.INIT.toString(),
				DossierStatus.INCA_VALD.toString(),
				DossierStatus.INCA_DECS.toString(),
				DossierStatus.INCA_AANR.toString(),
				DossierStatus.INCA_AVRS_RANR.toString(),
				DossierStatus.INCA_AVRS.toString(),
				DossierStatus.INCA_DECS_RS.toString()
		);

		if (resetStatuses.contains(oldDossier.getStatus())) {
			oldDossier.getWarranties().clear();
			newDossier.getWarranties().forEach(w -> {
				Warranty toAdd = new Warranty();
				toAdd.setContent(w.getContent());
				toAdd.setType(w.getType());
				toAdd.setDossier(oldDossier);
				toAdd.setAttachment(w.getAttachment());
				oldDossier.getWarranties().add(toAdd);
			});
			return;
		}

		Map<Long, Warranty> oldWarrantiesMap = oldDossier.getWarranties().stream()
				.filter(w -> w.getId() != null)
				.collect(Collectors.toMap(Warranty::getId, w -> w));

		Set<Long> newWarrantyIds = newDossier.getWarranties().stream()
				.map(Warranty::getId)
				.filter(Objects::nonNull)
				.collect(Collectors.toSet());

		oldDossier.getWarranties().removeIf(w ->
				w.getId() != null && !newWarrantyIds.contains(w.getId())
		);

		List<Warranty> toAdd = new ArrayList<>();
		for (Warranty newW : newDossier.getWarranties()) {
			if (newW.getId() != null && oldWarrantiesMap.containsKey(newW.getId())) {
				Warranty existing = oldWarrantiesMap.get(newW.getId());
				existing.setContent(newW.getContent());
				existing.setType(newW.getType());
			} else {
				Warranty warranty = new Warranty();
				warranty.setContent(newW.getContent());
				warranty.setType(newW.getType());
				warranty.setDossier(oldDossier);
				warranty.setAttachment(newW.getAttachment());
				toAdd.add(warranty);
			}
		}

		oldDossier.getWarranties().addAll(toAdd);
	}

	private void insertDossierUser(DossierDataDto dossierDto, DossierData oldDossier) {
		DossierUserDto duserDto = new ArrayList<>(dossierDto.getDossierUsers()).get(0);
		if (duserDto != null && duserDto.getUser() != null) {
			User user = userService.getUserBy(duserDto.getUser().getMatricule());
			if (user == null) {
				user = userService.getOrSaveUser(duserDto.getUser());
			}

			Optional<DossierUser> duser = dossierUserRepository.findByIdDossierIdAndIdUserIdAndIdCodeRole(
					oldDossier.getId(), user.getId(), duserDto.getCodeRole());
			if (!duser.isPresent()) {
				DossierUser dossierUser = new DossierUser(oldDossier, user, duserDto.getCodeProfession(), duserDto.getCodeRole());
				dossierUserRepository.save(dossierUser);
			}
		}
	}

	@Transactional(readOnly = true)
	public DossierDataDto getByUuid(String uuid) {
		Assert.notNull(uuid, CANNOT_PERFORM_THIS_ACTION);
		DossierData dossier = dossierDataRepository.findByUuid(uuid);
		Assert.exists(dossier, DOSSIER_NOT_EXIST);
		DossierDataDto dto = convertToDto(dossier);
		List<Task> tasks = taskRepository.findByDossierUuidAndDossierCodeStatusIn(uuid, TASK_STATUS_CODES);

		Map<String, Task> latestTasks = tasks.stream()
				.collect(Collectors.toMap(
						Task::getDossierCodeStatus,
						t -> t,
						(t1, t2) -> t1.getEntryDate().isAfter(t2.getEntryDate()) ? t1 : t2
				));
		if (latestTasks.containsKey(DossierStatus.OPCV.name())) {
			dto.setValidationOpcDate(latestTasks.get(DossierStatus.OPCV.name()).getEntryDate());
		}
		if (latestTasks.containsKey(DossierStatus.DECS.name())) {
			dto.setApprovalDate(latestTasks.get(DossierStatus.DECS.name()).getEntryDate());
		}
		if (latestTasks.containsKey(DossierStatus.TDSC_GEN.name())) {
			dto.setDscTransferDate(latestTasks.get(DossierStatus.TDSC_GEN.name()).getEntryDate());
		}
		return dto;
	}
	@Transactional(readOnly = true)
	public boolean checkDossierVersion(String uuid, Long version) {
		if (uuid == null || version == null) {
			return false;
		}
		return dossierDataRepository.existsByUuidAndVersion(uuid, version);
	}


	private void prepareDossier(DossierData dossier) {
		updateGuarantors(dossier);
		updateComments(dossier);
		updateRestrictions(dossier);
		updateRepresentatives(dossier);
	}
	private void updateRepresentatives(DossierData dossier) {
		List<Representative> representatives = dossier.getRepresentatives();
		if (representatives != null && !representatives.isEmpty()) {
			representatives.forEach(r -> r.setDossier(dossier));
		}
	}

	private void updateGuarantors(DossierData dossier) {
		List<Guarantor> newGuarantors = dossier.getGuarantors();
		if (newGuarantors != null && !newGuarantors.isEmpty()) {
			newGuarantors.forEach(g -> g.setDossier(dossier));
		}
	}

	private void updateComments(DossierData dossier) {
		List<Comment> comments = dossier.getComments();
		if (comments != null && !comments.isEmpty()) {
			comments.forEach(c -> c.setDossier(dossier));
		}
	}

	private void updateWarranties(DossierData dossier) {
		List<Warranty> warranties = dossier.getWarranties();
		if (warranties != null && !warranties.isEmpty()) {
			warranties.forEach(c -> c.setDossier(dossier));
		}
	}

	private void updateRestrictions(DossierData dossier) {
		List<Restriction> restrictions = dossier.getRestrictions();
		if (restrictions != null && !restrictions.isEmpty()) {
			restrictions.forEach(c -> c.setDossier(dossier));
		}
	}

	private DossierData convertToEntity(DossierDataDto dossierDataDto) {
		return dossierDataMapper.convertToEntity(dossierDataDto);
	}

	private DossierDataDto convertToDto(DossierData dossierData) {
		DossierDataDto dossierDataDto = dossierDataMapper.convertToDTO(dossierData);
		dossierDataDto.setCodeDossier(StringUtils.leftPad(dossierData.getId().toString(), 8, "0"));
		if(!CollectionUtils.isEmpty(dossierData.getDossierAttachmentTypes())){
			dossierDataDto.setDossierAttachmentTypes(
					dossierData.getDossierAttachmentTypes().stream().map(dossierAttachmentTypeMapper::convertToDTO).collect(Collectors.toList())
			);
		}
		return dossierDataDto;
	}

	@Transactional
	public List<DossierAttachmentTypeDto> createDossierAttachmentTypes(String uuid,
																	   RefAttachmentTypesCodesDto refAttachmentTypesCodes) {
		Assert.notNull(uuid, "You cannot perform this action");
		DossierDataDto dossier = getByUuid(uuid);
		Assert.exists(dossier, "Dossier not exists");
		return dossierAttachmentTypeService.generateDossierAttachmentTypeList(dossier, refAttachmentTypesCodes);
	}

	public List<DossierAttachmentTypeDto> getDossierAttachmentTypes(String uuid) {
		return dossierAttachmentTypeService.getDossierAttachmentTypeList(uuid);
	}

	@Transactional(readOnly = true)
	public List<DossierUserDto> getDossierUser(String dossierUuid, String userMatricule) {
		List<DossierUser> listDossierUser = dossierUserRepository.findByDossierUuidAndUserMatricule(dossierUuid,
				userMatricule);
		List<DossierUserDto> listDossierUserDto = new ArrayList<>();
		for (DossierUser dossierUser : listDossierUser) {
			listDossierUserDto.add(dossierUserMapper.convertToDTO(dossierUser));
		}

		return listDossierUserDto;
	}

	@Transactional(readOnly = true)
	public List<DossierUserDto> getDossierUserByUuid(String dossierUuid) {
		List<DossierUser> listDossierUser = dossierUserRepository.findByDossierUuid(dossierUuid);
		List<DossierUserDto> listDossierUserDto = new ArrayList<>();
		for (DossierUser dossierUser : listDossierUser) {
			listDossierUserDto.add(dossierUserMapper.convertToDTO(dossierUser));
		}
		return listDossierUserDto;
	}

	public Optional<DossierRequest> getLastDossierRequestInprogress(String dossierUuid){
		return dossierRequestRepository.findFirstByRequestStatusAndDossierUuidOrderByCreatedAtDesc(
				RequestStatus.IN_PROGRESS.toString(),
				dossierUuid
		);
	}


	@Transactional
	public DossierDataDto applyRestrictionsAndWarrantiesChanges(String uuid, NotificationGeneratorDto notificationGeneratorDto) {
		Assert.notNull(uuid, CANNOT_PERFORM_THIS_ACTION);

		DossierData dossierData = fetchDossierByUuid(uuid);
		processRestrictions(dossierData, notificationGeneratorDto.getRestrictions());

		DossierRequest dossierRequest = fetchDossierRequestInProgress(uuid);
		processWarranties(dossierRequest, notificationGeneratorDto.getWarranties());

		dossierRequestRepository.save(dossierRequest);

		DossierData updatedDossier = dossierDataRepository.save(dossierData);

		return dossierDataMapper.convertToDTO(updatedDossier);
	}


	private DossierData fetchDossierByUuid(String uuid) {
		DossierData dossierData = dossierDataRepository.findByUuid(uuid);
		Assert.exists(dossierData, DOSSIER_NOT_EXIST);
		return dossierData;
	}

	private void processRestrictions(DossierData dossierData, List<RestrictionDto> restrictionDtos) {
		if (restrictionDtos != null && !restrictionDtos.isEmpty()) {
			List<Restriction> newRestrictions = restrictionDtos.stream()
					.map(restrictionMapper::convertToEntity)
					.collect(Collectors.toList());

			Set<Long> existingRestrictionIds = dossierData.getRestrictions().stream()
					.map(Restriction::getId)
					.collect(Collectors.toSet());

			newRestrictions.removeIf(restriction -> existingRestrictionIds.contains(restriction.getId()));
			dossierData.getRestrictions().clear();
			dossierData.getRestrictions().addAll(newRestrictions);
		} else {
			dossierData.getRestrictions().clear();
		}
	}

	private DossierRequest fetchDossierRequestInProgress(String uuid) {
		return getLastDossierRequestInprogress(uuid)
				.orElseThrow(() -> new TechnicalException("Dossier request not found for UUID: " + uuid));
	}

	private void processWarranties(DossierRequest dossierRequest, List<WarrantyDto> warrantyDtos) {
		if (warrantyDtos != null) {
			List<RequestWarranty> warranties = warrantyDtos.stream()
					.map(requestWarrantyMapper::convertWarrantyDtoToRequestWarranty)
					.peek(warranty -> warranty.setDossierRequest(dossierRequest))
					.collect(Collectors.toList());
			dossierRequest.getRequestWarranties().clear();
			dossierRequest.getRequestWarranties().addAll(warranties);
		}
	}


	@Transactional
	public ReassignmentRequestDto createReassignmentRequest(ReassignmentRequestDto newRequestDto) {

		if(newRequestDto == null || newRequestDto.getDossier() == null) {
			throw new TechnicalException(INVALID_OR_NULL_DOSSIER_REQUEST_DTO);
		}

		ReassignmentRequest reassignmentRequest = reassignmentRequestMapper.convertToEntity(newRequestDto);
		DossierData dossierData = dossierDataRepository.findByUuid(newRequestDto.getDossier().getUuid());
		reassignmentRequest.setDossier(dossierData);
		ReassignmentRequest savedNewRequest = reassignmentRequestRepository.save(reassignmentRequest);

		return reassignmentRequestMapper.convertToDTO(savedNewRequest);

	}

	@Transactional(readOnly = true)
	public ReassignmentRequestDto getLastReassignInprogress(String dossierUuid){
		Optional<ReassignmentRequest> reassignmentRequest = reassignmentRequestRepository.findFirstByRequestStatusAndDossierUuidOrderByCreatedAtDesc(
				RequestStatus.IN_PROGRESS.toString(),
				dossierUuid
		);
		return reassignmentRequest.map(request -> reassignmentRequestMapper.convertToDTO(request)).orElse(null);
	}

	@Transactional(readOnly = true)
	public ReassignmentRequestDto getReassignRequestByUuid(String requestUuid) {
		return reassignmentRequestMapper.convertToDTO(reassignmentRequestRepository.findByUuid(requestUuid));
	}

	@Transactional
	public ReassignmentRequestDto updateReassignRequest(ReassignmentRequestDto requestDto) {
		if(requestDto == null || requestDto.getUuid() == null){
			throw new TechnicalException("Request data must be not null");
		}
		ReassignmentRequest request= reassignmentRequestRepository.findByUuid(requestDto.getUuid());
		request.setRequestStatus(requestDto.getRequestStatus());
		request.setValidatedBy(userMapper.convertToEntity(requestDto.getValidatedBy()));
		request.setValidationDate(requestDto.getValidationDate());
		return reassignmentRequestMapper.convertToDTO(reassignmentRequestRepository.save(request));
	}

	@Transactional(readOnly = true)
	public SearchResponse<KpiDossierData> searchDossierList(SearchRequest<DossierDataCriteria> searchRequest) {

		DossierDataCriteria searchCriteria = searchRequest.getSearchCriteria();
        if (DossierListEnum.ALL_REFUSED_TASKS.equals(searchCriteria.getListType())) {
            return searchRefusedAndAbandonedDossiers(searchRequest);
        }
		Specification<DossierKpiView> specifications = DossierSpecifications.allDossierByCriteria(searchCriteria)
				.and(dossierKpiSpecification.withEntity(searchCriteria.getEntityParams()))
				.and(DossierSpecifications.hasTaskStatus(searchCriteria.getDossierTaskStatus()))
				.and(DossierSpecifications.withoutPool(searchCriteria.getWithoutPool()))
				.and(DossierSpecifications.inPool(searchCriteria.getInPool()))
				.and(DossierSpecifications.withMarketCodeIn(searchCriteria.getEligibleMarketCodes(),searchCriteria.getListType()))
				.and(DossierSpecifications.hasReassignmentRequest(RequestStatus.IN_PROGRESS.toString(), searchCriteria.getHasRequest()))
				.and(dossierKpiSpecification.searchInProperties(searchableProperteies, searchCriteria.getSearchKeyword()))
				.and(dossierKpiSpecification.hasReachedStatus(searchCriteria.getReachedStatus()));

		int page = searchRequest.getPage();
		int size = searchRequest.getItemsPerPage();
		Pageable paging = PageRequest.of(page, size);
		Page<DossierKpiView> result = dossierDataRepository.search(specifications,paging,searchCriteria.getListType());
		return SearchResponse.<KpiDossierData>builder()
				.result(kpiDataMapper.convertToDossierDataResult(result.getContent()))
				.currentPage(result.getNumber() + 1)
				.numberOfElementsPerPage(result.getSize())
				.totalElements(result.getTotalElements())
				.totalPages(result.getTotalPages())
				.numberOfElementsInPage(result.getNumberOfElements())
				.build();
	}

	@Transactional
	public DossierDataDto updateWarrantiesAndRestrictions(DossierDataDto dossierDto) {
		log.info("Core Start: update warranties : {}, and restrictions : {}", dossierDto.getWarranties(), dossierDto.getRestrictions());
		Assert.notNull(dossierDto.getUuid(), CANNOT_PERFORM_THIS_ACTION);
		DossierData oldDossier = dossierDataRepository.findByUuid(dossierDto.getUuid());
		Assert.exists(oldDossier, DOSSIER_NOT_EXIST);
		DossierData newDossier = convertToEntity(dossierDto);

		if (!CollectionUtils.isEmpty(newDossier.getWarranties())) {
			oldDossier.getWarranties().clear();
			newDossier.getWarranties().forEach(w -> {
				Warranty toAdd = new Warranty();
				toAdd.setContent(w.getContent());
				toAdd.setType(w.getType());
				toAdd.setDossier(oldDossier);
				oldDossier.getWarranties().add(toAdd);
			});
			updateWarranties(oldDossier);
		} else {
			oldDossier.getWarranties().clear();
		}

		if (!CollectionUtils.isEmpty(newDossier.getRestrictions())) {
			oldDossier.getRestrictions().clear();
			newDossier.getRestrictions().forEach(r -> {
				Restriction toAdd = new Restriction();
				toAdd.setContent(r.getContent());
				toAdd.setType(r.getType());
				toAdd.setDossier(oldDossier);
				oldDossier.getRestrictions().add(toAdd);
			});
			updateRestrictions(oldDossier);
		} else {
			oldDossier.getRestrictions().clear();
		}

		DossierData updatedDossier = dossierDataRepository.save(oldDossier);
		log.info("Core End: Updated dossier : {}, warranties : {}, and restrictions : {}",
				updatedDossier.getDossierUsers(),
				updatedDossier.getWarranties(),
				updatedDossier.getRestrictions());
		return dossierDataMapper.convertToDTO(updatedDossier);
	}

	@Transactional
	public DossierDataDto updateCustomerDataAndInternalLoans(DossierDataDto dossierDto) {
		log.info("Start update: updateCustomerDataAndInternalLoans : {}",dossierDto.getCustomerData());
		Assert.notNull(dossierDto.getUuid(), CANNOT_PERFORM_THIS_ACTION);
		DossierData oldDossier = dossierDataRepository.findByUuid(dossierDto.getUuid());
		Assert.exists(oldDossier, DOSSIER_NOT_EXIST);
		DossierData newDossier = convertToEntity(dossierDto);

		if(Objects.nonNull(newDossier.getCustomerData())) {
			dossierDataMapper.updateCustomerFromDto(newDossier.getCustomerData().getCustomer(), oldDossier.getCustomerData().getCustomer());
			if(Objects.nonNull(newDossier.getCustomerData().getCard())){

                if(!this.instructionToDecisionStatus.contains(newDossier.getStatus()) ) {
                    String market = oldDossier.getCustomerData().getCard().getMarket();
                    newDossier.getCustomerData().getCard().setMarket(market);
                }
				oldDossier.getCustomerData().setCard(newDossier.getCustomerData().getCard());
			}
			if(Objects.nonNull(newDossier.getCustomerData().getBalanceActivity())){
				oldDossier.getCustomerData().setBalanceActivity(newDossier.getCustomerData().getBalanceActivity());
			}
		}

		if(!CollectionUtils.isEmpty(newDossier.getDebts())){
			oldDossier.getDebts().removeIf(debt -> debt.getEstablishmentCode().equals("022"));

			Set<Debt> updatedDebts = new HashSet<>(oldDossier.getDebts());
			updatedDebts.addAll(newDossier.getDebts());

			oldDossier.getDebts().addAll(new ArrayList<>(updatedDebts));
		}

		checkAndUpadteStatus(oldDossier);

		DossierData updatedDossier = dossierDataRepository.save(oldDossier);
		log.info("End update: updateCustomerDataAndInternalLoans : {}",updatedDossier.getCustomerData());
		return dossierDataMapper.convertToDTO(updatedDossier);
	}

	private void checkAndUpadteStatus(DossierData oldDossier) {
		if (!validateControles(oldDossier)){
			oldDossier.setStatus(getBlockedStatus(oldDossier.getStatus()));
		}else if (Arrays.asList(DossierStatus.BLOCKED_INIT.toString(), DossierStatus.BLOCKED_INCA_VALD.toString()).contains(oldDossier.getStatus())){
			oldDossier.setStatus(getOldStatus(oldDossier.getStatus()));
		}
	}

	private String getOldStatus(String status) {
		if (DossierStatus.BLOCKED_INIT.toString().equals(status)){
			return DossierStatus.INIT.toString();
		}
		return  DossierStatus.INCA_VALD.toString();
	}

	private String getBlockedStatus(String status) {
		if (DossierStatus.INIT.toString().equals(status)){
			return DossierStatus.BLOCKED_INIT.toString();
		}
		return  DossierStatus.BLOCKED_INCA_VALD.toString();
	}

	private Boolean validateControles(DossierData oldDossier) {
		if (oldDossier.getCustomerData() != null && oldDossier.getCustomerData().getCard() != null) {
			return Boolean.TRUE.equals(oldDossier.getCustomerData().getCard().getIsKyc());
		}
		return Boolean.TRUE;

	}

	public void delete(String uuid) {
		DossierData data = dossierDataRepository.findByUuid(uuid);
		if (data == null)
			return;
		dossierDataRepository.deleteDossier(data);
	}
	@Transactional(isolation = REPEATABLE_READ)
	public void updateStatusAndTask(UpdateDossierAndTaskRequest request) {
		DossierData dossierRef = dossierDataRepository.findByUuidForupdate(
				request.getDossierUuid());
		Assert.exists(dossierRef, DOSSIER_NOT_EXIST);

		if (request.getCodeStatus() != null) {
			dossierRef.setStatus(request.getCodeStatus());
			log.info("updateStatusAndTask: status → [{}] for dossier [{}]",
					request.getCodeStatus(), request.getDossierUuid());
		}

		dossierRef.setAssignee(request.getAssignee());
		dossierRef.setPoolCandidate(request.isPoolCandidate());
		dossierRef.setExpertiseTaskAssignee(request.getExpertiseTaskAssignee());
		log.info("updateStatusAndTask: assignee=[{}] pool=[{}] for dossier [{}]",
				request.getAssignee(), request.isPoolCandidate(), request.getDossierUuid());

		dossierDataRepository.save(dossierRef);

		if (request.getTask() != null) {
			taskService.update(request.getTask());
			log.info("updateStatusAndTask: task exit updated for dossier [{}]",
					request.getDossierUuid());
		}
	}

	@Transactional
	public void updateStatus(DossierDataDto dossierDto) {
		Assert.notNull(dossierDto.getUuid(), CANNOT_PERFORM_THIS_ACTION);
		DossierData dossierRef = dossierDataRepository.findByUuidForupdate(dossierDto.getUuid());
		Assert.exists(dossierRef, DOSSIER_NOT_EXIST);
		dossierRef.setStatus(dossierDto.getCodeStatus());
		dossierDataRepository.save(dossierRef);
		log.info("updateStatus: dossier [{}] → [{}]",
				dossierDto.getUuid(), dossierDto.getCodeStatus());
	}

	@Transactional
	public void updateAssignee(String uuid, String assignee, boolean poolCandidate) {
		Assert.notNull(uuid, CANNOT_PERFORM_THIS_ACTION);
		DossierData dossierRef = dossierDataRepository.findByUuidForupdate(uuid);
		Assert.exists(dossierRef, DOSSIER_NOT_EXIST);
		dossierRef.setAssignee(assignee);
		dossierRef.setPoolCandidate(poolCandidate);
		dossierDataRepository.save(dossierRef);
		log.info("updateAssignee: dossier [{}] → assignee=[{}] pool=[{}]",
				uuid, assignee, poolCandidate);
	}

	@Transactional
	public void updateFlowStatus(String uuid, String flowStatus) {
		Assert.notNull(uuid, CANNOT_PERFORM_THIS_ACTION);
		int updatedRows = dossierDataRepository.updateFlowStatusByUuid(uuid, flowStatus);
		if (updatedRows == 0) {
			log.warn("updateFlowStatus: dossier [{}] not found", uuid);
			throw new TechnicalException(DOSSIER_NOT_EXIST);
		}
		log.info("updateFlowStatus: dossier [{}] → [{}]", uuid, flowStatus);
	}

	@Transactional(isolation = REPEATABLE_READ)
	public void persistTransitionDeltas(DossierDataDto dossierDto) {
		boolean hasComments      = !CollectionUtils.isEmpty(dossierDto.getComments());
		boolean hasUsers         = !CollectionUtils.isEmpty(dossierDto.getDossierUsers());
		boolean hasScalarFields  = hasScalarTransitionFields(dossierDto);
		boolean hasLoanDataDelta = hasLoanDataDelta(dossierDto);

		if (!hasComments && !hasUsers && !hasScalarFields && !hasLoanDataDelta) {
			log.info("persistTransitionDeltas: nothing to persist for dossier [{}]",
					dossierDto.getUuid());
			return;
		}
		DossierData dossierRef = dossierDataRepository.findByUuidForupdate(dossierDto.getUuid());
		Assert.exists(dossierRef, DOSSIER_NOT_EXIST);
		if (hasScalarFields) {
			if (dossierDto.getHasTaskExpertise() != null) {
				dossierRef.setHasTaskExpertise(dossierDto.getHasTaskExpertise());
			}
			if (dossierDto.getOpcDeliveryDate() != null) {
				dossierRef.setOpcDeliveryDate(dossierDto.getOpcDeliveryDate());
			}
			if (dossierDto.getDateOfReceiptOpcSigned() != null) {
				dossierRef.setDateOfReceiptOpcSigned(dossierDto.getDateOfReceiptOpcSigned());
			}
			if (dossierDto.getFirstReleasedDate() != null) {
				dossierRef.setFirstReleasedDate(dossierDto.getFirstReleasedDate());
			}
			if (dossierDto.getDateOfReceiptPhysicalFile() != null) {
				dossierRef.setDateOfReceiptPhysicalFile(dossierDto.getDateOfReceiptPhysicalFile());
			}
			log.info("persistTransitionDeltas: scalar fields updated for dossier [{}]",
					dossierDto.getUuid());
		}

		if (hasLoanDataDelta && dossierRef.getLoanData() != null) {
			LoanDataDto loanDataDto = dossierDto.getLoanData();
			if (loanDataDto.getAmountReleased() != null) {
				dossierRef.getLoanData().setAmountReleased(loanDataDto.getAmountReleased());
			}
			if (loanDataDto.getAmountToRelease() != null) {
				dossierRef.getLoanData().setAmountToRelease(loanDataDto.getAmountToRelease());
			}
			log.info("persistTransitionDeltas: loanData updated for dossier [{}]",
					dossierDto.getUuid());
		}

		if (hasComments) {
			persistCommentsInternal(dossierDto, dossierRef);
		}

		if (hasUsers) {
			insertDossierUser(dossierDto, dossierRef);
		}

		dossierDataRepository.save(dossierRef);
		log.info("persistTransitionDeltas: all deltas saved for dossier [{}]",
				dossierDto.getUuid());
	}

	private boolean hasScalarTransitionFields(DossierDataDto dto) {
		return dto.getHasTaskExpertise()           != null
				|| dto.getOpcDeliveryDate()            != null
				|| dto.getDateOfReceiptOpcSigned()     != null
				|| dto.getFirstReleasedDate()          != null
				|| dto.getDateOfReceiptPhysicalFile()  != null;
	}

	private boolean hasLoanDataDelta(DossierDataDto dto) {
		return dto.getLoanData() != null
				&& (dto.getLoanData().getAmountReleased()  != null
				|| dto.getLoanData().getAmountToRelease() != null);
	}


	@Transactional(propagation = Propagation.REQUIRES_NEW)
	public AmortizableLoanDetailDto saveAmortizableLoanDetail(AmortizableLoanDetailDto amortizableLoanDetailDto) {
		if(amortizableLoanDetailDto == null || amortizableLoanDetailDto.getDossierUuid() == null){
			throw new TechnicalException(AMORTIZABLE_LOAN_OR_DOSSIER_UUID_MUST_BE_NOT_NULL);
		}
		AmortizableLoanDetail existing = amortizableLoanRepository.findByDossierUuid(amortizableLoanDetailDto.getDossierUuid())
				.orElse(new AmortizableLoanDetail());

		amortizableLoanMapper.updateEntityFromDto(amortizableLoanDetailDto, existing);
		existing.setDossierUuid(amortizableLoanDetailDto.getDossierUuid());
		return amortizableLoanMapper.toDto(amortizableLoanRepository.save(existing));
	}



	private void persistCommentsInternal(DossierDataDto dossierDto, DossierData dossierRef) {
		DossierData transient_ = convertToEntity(dossierDto);
		List<Comment> newComments = transient_.getComments();
		if (CollectionUtils.isEmpty(newComments)) return;

		newComments.forEach(c -> {
			if (c.getUuid() == null) c.setUuid(UUID.randomUUID().toString());
		});

		Set<String> existingUuids = dossierRef.getComments().stream()
				.map(Comment::getUuid)
				.filter(Objects::nonNull)
				.collect(Collectors.toSet());

		List<Comment> toInsert = newComments.stream()
				.filter(c -> !existingUuids.contains(c.getUuid()))
				.peek(c -> c.setDossier(dossierRef))
				.collect(Collectors.toList());

		if (!toInsert.isEmpty()) {
			commentRepository.saveAll(toInsert);
			log.info("persistCommentsInternal: {} comment(s) inserted for dossier [{}]",
					toInsert.size(), dossierDto.getUuid());
		}
	}

    @Transactional(readOnly = true)
    public SearchResponse<KpiDossierData> searchRefusedAndAbandonedDossiers(SearchRequest<DossierDataCriteria> searchRequest) {
        DossierDataCriteria searchCriteria = searchRequest.getSearchCriteria();

        Specification<DossierKpiRefusedView> specifications = DossierSpecifications
                .allDossierByCriteria(searchCriteria, DossierKpiRefusedView.class)
                .and(DossierSpecifications.hasReassignmentRequest(RequestStatus.IN_PROGRESS.toString(), searchCriteria.getHasRequest()));

        int page = searchRequest.getPage();
        int size = searchRequest.getItemsPerPage();
        Pageable paging = PageRequest.of(page, size);
        Page<DossierKpiRefusedView> result = dossierKpiRefusedViewRepository.findAll(specifications, paging);

        return SearchResponse.<KpiDossierData>builder()
                .result(result.getContent().stream().map(kpiDataMapper::convertToDTO).collect(Collectors.toList()))
                .currentPage(result.getNumber() + 1)
                .numberOfElementsPerPage(result.getSize())
                .totalElements(result.getTotalElements())
                .totalPages(result.getTotalPages())
                .numberOfElementsInPage(result.getNumberOfElements())
                .build();
    }
}
