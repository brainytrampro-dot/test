package ma.sg.its.octroicreditcore.service;

import lombok.AllArgsConstructor;
import lombok.NoArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import ma.sg.its.octroicreditcore.Specification.DossierKpiSpecification;
import ma.sg.its.octroicreditcore.dto.*;
import ma.sg.its.octroicreditcore.dto.kpi.KpiDossierData;
import ma.sg.its.octroicreditcore.enumeration.DossierStatus;
import ma.sg.its.octroicreditcore.enumeration.RequestStatus;
import ma.sg.its.octroicreditcore.exception.TechnicalException;
import ma.sg.its.octroicreditcore.mapper.*;
import ma.sg.its.octroicreditcore.mapper.kpi.KpiDataMapper;
import ma.sg.its.octroicreditcore.model.*;
import ma.sg.its.octroicreditcore.model.comments.Comment;
import ma.sg.its.octroicreditcore.repository.*;
import ma.sg.its.octroicreditcore.strategy.DossierCreation;
import ma.sg.its.octroicreditcore.strategy.DossierCreationContext;
import ma.sg.its.octroicreditcore.util.Assert;
import org.apache.commons.collections.CollectionUtils;
import org.apache.commons.lang.ObjectUtils;
import org.apache.commons.lang.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
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
	private AmortizableLoanRepository amortizableLoanRepository;

	@Autowired
	private AmortizableLoanMapper amortizableLoanMapper;

	@Autowired
	private PropertyMapper propertyMapper;
	@Autowired
	private BeneficiaryMapper beneficiaryMapper;

	private final static  List<String> searchableProperteies=Arrays.asList(
			"numeroDossier", "clientFullname", "designationProduct",
			"marketShorthandGlobal", "loanAmount", "initiator", "assignee", "stage", "status",
			"designation", "drCode", "drppCode", "ucCode", "agencyCode");

	public DossierDataDto create(DossierDataDto dossierDto){

		DossierCreation strategy= dossierCreationContext.resolve(dossierDto);
		return strategy.create(dossierDto);
	}

	public void updateProspect(DossierDataDto dossierDataDto, DossierData old) {
		if(old != null){
			CustomerCard customerCard = customerMapper.convertCustomerCardToEntity(dossierDataDto.getCustomerData());
			CustomerCard savedCard = customerCardRepository.save(customerCard);
			old.setCustomerData(savedCard);
		}
	}

	public DossierDataDto update(DossierDataDto dossierDto) {
		Assert.notNull(dossierDto.getUuid(), CANNOT_PERFORM_THIS_ACTION);
		DossierData oldDossier = dossierDataRepository.findByUuid(dossierDto.getUuid());
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

		oldDossier.getGuarantors().clear();
		if (newDossier.getGuarantors() != null) {
			oldDossier.getGuarantors().addAll(newDossier.getGuarantors());
		}
		oldDossier.getBeneficiaries().clear();
		if (newDossier.getBeneficiaries() != null) {
			oldDossier.getBeneficiaries().addAll(newDossier.getBeneficiaries());
		}

		//TODO change Hardcoded String 022 to properties.local
		if (oldDossier.getLoanData() != null && oldDossier.getLoanData().getIsExternDebtsRetrieved() != null &&
				!oldDossier.getLoanData().getIsExternDebtsRetrieved() && newDossier.getDebts() != null) {
			Predicate<Debt> p = debt -> debt != null && !"022".equals(debt.getEstablishmentCode());
			List<Debt> debtList = newDossier.getDebts().stream().filter(p).collect(Collectors.toList());
			debtRepository.saveAll(debtList);
			oldDossier.getDebts().addAll(debtList);
		}
		if (oldDossier.getLoanData() != null && oldDossier.getLoanData().getIsExternDebtsInfnRetrieved() != null &&
				!oldDossier.getLoanData().getIsExternDebtsInfnRetrieved() && newDossier.getDebtsinfon() != null
				&& !newDossier.getDebtsinfon().isEmpty()) {
			debtInfonRepository.saveAll(newDossier.getDebtsinfon());
			oldDossier.getDebtsinfon().addAll(newDossier.getDebtsinfon());
		}

		if (newDossier.getWarranties() != null) {
			if(Arrays.asList(
					DossierStatus.INIT.toString(), DossierStatus.INCA_VALD.toString(), DossierStatus.INCA_DECS.toString(), DossierStatus.INCA_AANR.toString(),
					DossierStatus.INCA_AVRS_RANR.toString(), DossierStatus.INCA_AVRS.toString(), DossierStatus.INCA_DECS_RS.toString()
			).contains(oldDossier.getStatus())) {
				oldDossier.getWarranties().clear();
				newDossier.getWarranties().forEach(w-> w.setId(null));
			}
			Set<Long> warrantyIds = oldDossier.getWarranties().stream().map(Warranty::getId).collect(Collectors.toSet());
			newDossier.getWarranties().removeIf(warranty -> warrantyIds.contains(warranty.getId()));
			// Handle proposed warranties logic
			updateProposedWarranties(newDossier, oldDossier);
			oldDossier.getWarranties().addAll(newDossier.getWarranties());
		}else {
			oldDossier.getWarranties().clear();
		}

		if (newDossier.getRestrictions() != null && !newDossier.getRestrictions().isEmpty()) {
			Set<Long> restrictionIds = oldDossier.getRestrictions().stream().map(Restriction::getId).collect(Collectors.toSet());
			newDossier.getRestrictions().removeIf(restriction -> restrictionIds.contains(restriction.getId()));
			oldDossier.getRestrictions().addAll(newDossier.getRestrictions());
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
		oldDossier.setRepresentative((Representative) ObjectUtils.defaultIfNull(newDossier.getRepresentative(),oldDossier.getRepresentative()));
		oldDossier.setNotary((Notary) ObjectUtils.defaultIfNull(newDossier.getNotary(),oldDossier.getNotary()));
		oldDossier.setOpcDeliveryDate((LocalDate) ObjectUtils.defaultIfNull(newDossier.getOpcDeliveryDate(),oldDossier.getOpcDeliveryDate()));
		oldDossier.setDateOfReceiptOpcSigned((LocalDate) ObjectUtils.defaultIfNull(newDossier.getDateOfReceiptOpcSigned(),oldDossier.getDateOfReceiptOpcSigned()));
		oldDossier.setMinuteRequestCommitmentDate((LocalDate) ObjectUtils.defaultIfNull(newDossier.getMinuteRequestCommitmentDate(),oldDossier.getMinuteRequestCommitmentDate()));
		oldDossier.setDateOfReceiptMinuteAndCommitment((LocalDate) ObjectUtils.defaultIfNull(newDossier.getDateOfReceiptMinuteAndCommitment(),oldDossier.getDateOfReceiptMinuteAndCommitment()));
		oldDossier.setDateOfReceiptPhysicalFile((LocalDate) ObjectUtils.defaultIfNull(newDossier.getDateOfReceiptPhysicalFile(),oldDossier.getDateOfReceiptPhysicalFile()));
		oldDossier.setFirstReleasedDate(newDossier.getFirstReleasedDate() == null ? oldDossier.getFirstReleasedDate(): newDossier.getFirstReleasedDate());
		oldDossier.setCcgCommessionMatrix((CcgCommessionMatrix) ObjectUtils.defaultIfNull(newDossier.getCcgCommessionMatrix(),oldDossier.getCcgCommessionMatrix()));

		if (newDossier.getComments() != null) {
			oldDossier.getComments().addAll(newDossier.getComments());
		}

		linkPropertiesToBeneficiaries(dossierDto, oldDossier);
		prepareDossier(oldDossier);

		// set dossier-user relationship if exist
		if (dossierDto.getDossierUsers() != null)
			insertDossierUser(dossierDto, oldDossier);

		oldDossier.setAssignee(newDossier.getAssignee());
		oldDossier.setPoolCandidate(newDossier.getPoolCandidate());
		oldDossier.setRepresentative(newDossier.getRepresentative());
		oldDossier.setHasTaskExpertise(newDossier.getHasTaskExpertise());
		oldDossier.setAccord(newDossier.getAccord());
		oldDossier.setProspectUuid(newDossier.getProspectUuid());
		oldDossier.setFlowStatus(newDossier.getFlowStatus());

		DossierData updatedData = dossierDataRepository.save(oldDossier);
		return convertToDto(updatedData);
	}

	private void updateProposedWarranties(DossierData newDossier, DossierData oldDossier) {
		List<Warranty> proposedWarranties = newDossier.getWarranties()
				.stream()
				.filter(warranty -> List.of(WarrantyType.PROPOSED, WarrantyType.AUTO).contains(warranty.getType()))
				.collect(Collectors.toList());

		if (!proposedWarranties.isEmpty()) {
			oldDossier.getWarranties().removeIf(warranty -> List.of(WarrantyType.PROPOSED, WarrantyType.AUTO).contains(warranty.getType()));
		}
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

		return convertToDto(dossier);
	}

	private void prepareDossier(DossierData dossier) {
		updateGuarantors(dossier);
		updateComments(dossier);
		updateWarranties(dossier);
		updateRestrictions(dossier);
	}
	private void linkPropertiesToBeneficiaries(DossierDataDto dto, DossierData existingDossier) {
		initializeCollections(existingDossier);
		Map<String, Property> propertyPool = new HashMap<>();

		if (dto.getPropertyData() != null && dto.getPropertyData().getProperties() != null) {
			processProperties(dto.getPropertyData().getProperties(), existingDossier, propertyPool);
		}

		if (dto.getBeneficiaries() != null) {
			syncBeneficiaries(dto.getBeneficiaries(), existingDossier, propertyPool);
		}
	}

	private void processProperties(List<PropertyDto> propDtos, DossierData dossier, Map<String, Property> pool) {
		if (dossier.getProperties() == null) dossier.setProperties(new ArrayList<>());

		// 1. Map des DTOs par ID
		Map<Long, PropertyDto> dtoMap = propDtos.stream()
				.filter(p -> p.getId() != null)
				.collect(Collectors.toMap(PropertyDto::getId, p -> p));

		// 2. Suppression (Le removeIf suffit car @JoinColumn va délier les objets)
		dossier.getProperties().removeIf(p -> p.getId() != null && !dtoMap.containsKey(p.getId()));

		// 3. Update & Add
		for (PropertyDto pDto : propDtos) {
			Property property;
			if (pDto.getId() != null) {
				// Update l'instance attachée pour éviter StaleObject
				property = dossier.getProperties().stream()
						.filter(p -> p.getId().equals(pDto.getId())).findFirst()
						.orElseGet(() -> propertyMapper.convertToEntity(pDto)); // Cas rare
				propertyMapper.updateFromDto(pDto, property);
				property.syncRangsFromDto(pDto.getRangs());
			} else {
				// Create uniquement si pas déjà présent (basé sur UUID du DTO)
				property = propertyMapper.convertToEntity(pDto);
				dossier.getProperties().add(property);
			}
			fillPropertyPool(property, pDto, pool);
		}
	}

	private void syncBeneficiaries(List<BeneficiaryDto> dtos, DossierData dossier, Map<String, Property> pool) {
		if (dossier.getProperties() == null) dossier.setProperties(new ArrayList<>());

		// 1. Map des DTOs par ID
		Map<Long, BeneficiaryDto> dtoMap = dtos.stream()
				.filter(p -> p.getId() != null)
				.collect(Collectors.toMap(BeneficiaryDto::getId, p -> p));

		// 2. Suppression (Le removeIf suffit car @JoinColumn va délier les objets)
		dossier.getBeneficiaries().removeIf(p -> p.getId() != null && !dtoMap.containsKey(p.getId()));

		dossier.getBeneficiaries().forEach(benef -> {
			if(dtoMap.containsKey(benef.getId())){
				BeneficiaryDto bDto = dtoMap.get(benef.getId());
				beneficiaryMapper.updateFromDto(bDto, benef);
				benef.syncProperties(bDto.getProperties(), pool);
			}
		});

		for (BeneficiaryDto bDto : dtos) {
			if (bDto.getId() == null) {
				boolean alreadyExists = dossier.getBeneficiaries().stream()
						.anyMatch(b -> b.getId() == null && bDto.getUuid() != null && bDto.getUuid().equals(b.getUuid()));

				if (!alreadyExists) {
					Beneficiary beneficiary = beneficiaryMapper.convertToEntity(bDto);
					beneficiary.syncProperties(bDto.getProperties(), pool);
					dossier.getBeneficiaries().add(beneficiary);
				}
			}
		}
	}


	private void fillPropertyPool(Property p, PropertyDto dto, Map<String, Property> pool) {
		if (dto == null) return;
		String key = (dto.getUuid() != null) ? dto.getUuid() :
				(dto.getId() != null ? dto.getId().toString() : null);
		if (key != null) pool.put(key, p);
	}

	private void initializeCollections(DossierData dossier) {
		if (dossier.getBeneficiaries() == null) dossier.setBeneficiaries(new ArrayList<>());
		if (dossier.getProperties() == null) dossier.setProperties(new ArrayList<>());
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
		Specification<DossierKpiView> specifications = DossierSpecifications.allDossierByCriteria(searchCriteria)
			.and(dossierKpiSpecification.withEntity(searchCriteria.getEntityParams()))
			.and(DossierSpecifications.hasTaskStatus(searchCriteria.getDossierTaskStatus()))
			.and(DossierSpecifications.withoutPool(searchCriteria.getWithoutPool()))
			.and(dossierKpiSpecification.withDossierUserEquals(searchCriteria.getEntityParams(),searchCriteria.getListType()))
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
			oldDossier.getWarranties().addAll(newDossier.getWarranties());
			updateWarranties(oldDossier);
		}else {
			oldDossier.getWarranties().clear();
		}

		if (!CollectionUtils.isEmpty(newDossier.getRestrictions())) {
			oldDossier.getRestrictions().clear();
			oldDossier.getRestrictions().addAll(newDossier.getRestrictions());
			updateRestrictions(oldDossier);
		}else{
			oldDossier.getRestrictions().clear();
		}

		DossierData updatedDossier = dossierDataRepository.save(oldDossier);
		log.info("Core End: Updated dossier : {}, warranties : {}, and restrictions : {}",updatedDossier.getDossierUsers(),
				updatedDossier.getWarranties(), updatedDossier.getRestrictions());
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

	@Transactional
	public DossierDataDto updateDossierAndTask(UpdateDossierAndTaskRequest request) {
		DossierDataDto updatedDossier = this.update(request.getDossier());
		taskService.update(request.getTask());
		return updatedDossier;
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
}
