
dossier.getBeneficiaries().stream()
            .filter(b -> b.getId() != null && !dtoMap.containsKey(b.getId()))
            .forEach(b -> b.getRangs().clear());




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
    private TaskRepository taskRepository;

	@Autowired
	private AmortizableLoanRepository amortizableLoanRepository;

	@Autowired
	private AmortizableLoanMapper amortizableLoanMapper;

	@Autowired
	private PropertyMapper propertyMapper;
	@Autowired
	private BeneficiaryMapper beneficiaryMapper;
    private static final List<String> TASK_STATUS_CODES = Arrays.asList(
            DossierStatus.OPCV.name(),
            DossierStatus.DECS.name(),
            DossierStatus.TDSC_GEN.name()
    );

	private final static  List<String> searchableProperteies=Arrays.asList(
			"numeroDossier", "clientFullname", "designationProduct",
			"marketShorthandGlobal", "loanAmount", "initiator", "assignee", "stage", "status",
			"designation", "drCode", "drppCode", "ucCode", "agencyCode");
    @Autowired
    private GuarantorMapper guarantorMapper;

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
       syncGuarantors(dossierDto, oldDossier);
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

		linkPropertiesToBeneficiaries(dossierDto, oldDossier);
		prepareDossier(oldDossier);
        syncRepresentatives(dossierDto, oldDossier);
		// set dossier-user relationship if exist
		if (dossierDto.getDossierUsers() != null)
			insertDossierUser(dossierDto, oldDossier);

		oldDossier.setAssignee(newDossier.getAssignee());
		oldDossier.setPoolCandidate(newDossier.getPoolCandidate());
		oldDossier.setHasTaskExpertise(newDossier.getHasTaskExpertise());
		oldDossier.setAccord(newDossier.getAccord());
		oldDossier.setProspectUuid(newDossier.getProspectUuid());
		oldDossier.setFlowStatus(newDossier.getFlowStatus());

		DossierData updatedData = dossierDataRepository.save(oldDossier);
		return convertToDto(updatedData);
	}
    public void syncGuarantors(DossierDataDto newDossier, DossierData dossier) {
        if (newDossier.getGuarantors() == null) {
            dossier.getGuarantors().clear();
            return;
        }

        Map<Long, GuarantorDto> newDtoMap = newDossier.getGuarantors().stream()
                .filter(dto -> dto.getId() != null)
                .collect(Collectors.toMap(GuarantorDto::getId, dto -> dto));

        dossier.getGuarantors().removeIf(g -> g.getId() != null && !newDtoMap.containsKey(g.getId()));

        for (Guarantor existingGar : dossier.getGuarantors()) {
            if (existingGar.getId() != null && newDtoMap.containsKey(existingGar.getId())) {
                guarantorMapper.updateFromDto(newDtoMap.get(existingGar.getId()), existingGar);
            }
        }

        newDossier.getGuarantors().stream()
                .filter(dto -> dto.getId() == null)
                .map(guarantorMapper::convertToEntity)
                .peek(g -> g.setDossier(dossier))
                .forEach(dossier.getGuarantors()::add);
    }

    public void syncRepresentatives(DossierDataDto newDossier, DossierData dossier) {
        if (CollectionUtils.isEmpty(newDossier.getRepresentatives())) {
            clearAllRepresentativeReferences(dossier);
            dossier.getRepresentatives().clear();
            return;
        }
        Set<Long> incomingIds = newDossier.getRepresentatives().stream()
                .map(RepresentativeDto::getId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        dossier.getRepresentatives().removeIf(r -> r.getId() != null && !incomingIds.contains(r.getId()));

        Map<Long, Representative> existingById = dossier.getRepresentatives().stream()
                .filter(r -> r.getId() != null)
                .collect(Collectors.toMap(Representative::getId, r -> r));

        for (RepresentativeDto repDto : newDossier.getRepresentatives()) {
            Representative rep = upsertRepresentative(repDto, existingById, dossier);
            linkRepresentativeRelationships(repDto, rep, dossier);
        }
    }

    private Representative upsertRepresentative(
            RepresentativeDto dto,
            Map<Long, Representative> existingById,
            DossierData dossier) {

        Representative rep;

        if (dto.getId() != null && existingById.containsKey(dto.getId())) {
            rep = existingById.get(dto.getId());
            rep.unlinkAllBeneficiaries();
            rep.unlinkAllGuarantors();
            rep.unlinkAllCustomers();
        } else {
            rep = new Representative();
            rep.setDossier(dossier);
            dossier.getRepresentatives().add(rep);
        }

        rep.setFirstname(dto.getFirstname());
        rep.setLastname(dto.getLastname());
        rep.setCin(dto.getCin());
        rep.setCinIssuedAt(dto.getCinIssuedAt());

        return rep;
    }

    private void linkRepresentativeRelationships(
            RepresentativeDto dto,
            Representative entity,
            DossierData dossier) {

        linkCustomerRelationship(dto, entity, dossier);
        linkBeneficiaryRelationships(dto, entity, dossier);
        linkGuarantorRelationships(dto, entity, dossier);
    }

    private void linkCustomerRelationship(RepresentativeDto dto, Representative entity, DossierData dossier) {
        if (dto.getCustomer() == null || dossier.getCustomerData() == null) {
            return;
        }

        Customer customer = dossier.getCustomerData().getCustomer();
        LocalDate proxyDate = dto.getCustomer().getProxyDate();

        if (customer != null && proxyDate != null) {
            entity.linkCustomer(customer, proxyDate);
        }
    }

    private void linkBeneficiaryRelationships(RepresentativeDto dto, Representative entity, DossierData dossier) {
        if (CollectionUtils.isEmpty(dto.getBeneficiaries()) || CollectionUtils.isEmpty(dossier.getBeneficiaries())) {
            return;
        }

        dto.getBeneficiaries().forEach(benDto -> linkBeneficiary(entity, benDto, dossier));
    }

    private void linkBeneficiary(Representative entity, RepresentativeBeneficiaryDto benDto, DossierData dossier) {
        if (benDto.getBeneficiary() == null || benDto.getProxyDate() == null) {
            return;
        }

        dossier.getBeneficiaries().stream()
                .filter(b -> isSameBeneficiary(b, benDto.getBeneficiary()))
                .findFirst()
                .ifPresent(beneficiary -> entity.linkBeneficiary(beneficiary, benDto.getProxyDate()));
    }

    private void linkGuarantorRelationships(RepresentativeDto dto, Representative entity, DossierData dossier) {
        if (CollectionUtils.isEmpty(dto.getGuarantors()) || CollectionUtils.isEmpty(dossier.getGuarantors())) {
            return;
        }

        dto.getGuarantors().forEach(garDto -> linkGuarantor(entity, garDto, dossier));
    }

    private void linkGuarantor(Representative entity, RepresentativeGuarantorDto garDto, DossierData dossier) {
        if (garDto.getGuarantor() == null || garDto.getProxyDate() == null) {
            return;
        }

        dossier.getGuarantors().stream()
                .filter(g -> isSameGuarantor(g, garDto.getGuarantor()))
                .findFirst()
                .ifPresent(guarantor -> entity.linkGuarantor(guarantor, garDto.getProxyDate()));
    }

    private boolean isSameBeneficiary(Beneficiary beneficiary, BeneficiaryDto dto) {
        return beneficiary != null && beneficiary.getId() != null && beneficiary.getId().equals(dto.getId());
    }

    private boolean isSameGuarantor(Guarantor guarantor, GuarantorDto dto) {
        return guarantor != null && guarantor.getId() != null && guarantor.getId().equals(dto.getId());
    }
    private void clearAllRepresentativeReferences(DossierData dossier) {
        if (dossier.getRepresentatives() != null) {
            dossier.getRepresentatives().forEach(rep -> {
                rep.unlinkAllBeneficiaries();
                rep.unlinkAllGuarantors();
                rep.unlinkAllCustomers();
            });
        }
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

	private void prepareDossier(DossierData dossier) {
		updateGuarantors(dossier);
		updateComments(dossier);
		updateWarranties(dossier);
		updateRestrictions(dossier);
        updateRepresentatives(dossier);
	}
    private void updateRepresentatives(DossierData dossier) {
        List<Representative> representatives = dossier.getRepresentatives();
        if (representatives != null && !representatives.isEmpty()) {
            representatives.forEach(r -> r.setDossier(dossier));
        }
    }
	private void linkPropertiesToBeneficiaries(DossierDataDto dto, DossierData existingDossier) {
		initializeCollections(existingDossier);
		Map<String, Property> propertyPool = new HashMap<>();

		if (dto.getPropertyData() != null && dto.getPropertyData().getProperties() != null) {
			processProperties(dto.getPropertyData().getProperties(), existingDossier, propertyPool);
		}else{
			existingDossier.getProperties().clear();
		}

		if (dto.getBeneficiaries() != null) {
			syncBeneficiaries(dto.getBeneficiaries(), existingDossier, propertyPool);
		}else {
			existingDossier.getBeneficiaries().clear();
		}
	}

	private void processProperties(List<PropertyDto> propDtos, DossierData dossier, Map<String, Property> pool) {
		if (dossier.getProperties() == null) dossier.setProperties(new ArrayList<>());

		Map<Long, PropertyDto> dtoMap = propDtos.stream()
				.filter(p -> p.getId() != null)
				.collect(Collectors.toMap(PropertyDto::getId, p -> p));

		dossier.getProperties().removeIf(p -> p.getId() != null && !dtoMap.containsKey(p.getId()));

		for (PropertyDto pDto : propDtos) {
			Property property;
			if (pDto.getId() != null) {
				property = dossier.getProperties().stream()
						.filter(p -> p.getId().equals(pDto.getId())).findFirst()
						.orElseGet(() -> propertyMapper.convertToEntity(pDto)); // Cas rare
				propertyMapper.updateFromDto(pDto, property);
			} else {
				property = propertyMapper.convertToEntity(pDto);
                property.setDossier(dossier);
                dossier.getProperties().add(property);
			}
            fillPropertyPool(property, pDto, pool);
		}
	}

	private void syncBeneficiaries(List<BeneficiaryDto> dtos, DossierData dossier, Map<String, Property> pool) {
		if (dossier.getBeneficiaries() == null) dossier.setBeneficiaries(new ArrayList<>());

		Map<Long, BeneficiaryDto> dtoMap = dtos.stream()
				.filter(p -> p.getId() != null)
				.collect(Collectors.toMap(BeneficiaryDto::getId, p -> p));

		dossier.getBeneficiaries().removeIf(p -> p.getId() != null && !dtoMap.containsKey(p.getId()));

		dossier.getBeneficiaries().forEach(benef -> {
			if(dtoMap.containsKey(benef.getId())){
				BeneficiaryDto bDto = dtoMap.get(benef.getId());
				beneficiaryMapper.updateFromDto(bDto, benef);
				benef.syncProperties(bDto.getProperties(), pool);
				benef.syncRangs(bDto.getRangs(), pool);
			}
		});

		for (BeneficiaryDto bDto : dtos) {
			if (bDto.getId() == null) {
				boolean alreadyExists = dossier.getBeneficiaries().stream()
						.anyMatch(b -> b.getId() == null && bDto.getUuid() != null && bDto.getUuid().equals(b.getUuid()));

				if (!alreadyExists) {
					Beneficiary beneficiary = beneficiaryMapper.convertToEntity(bDto);
					beneficiary.setDossier(dossier);
					beneficiary.syncProperties(bDto.getProperties(), pool);
					beneficiary.syncRangs(bDto.getRangs(), pool);
					dossier.getBeneficiaries().add(beneficiary);
				}
			}
		}
	}


	private void fillPropertyPool(Property p, PropertyDto dto, Map<String, Property> pool) {
		if (dto == null) return;
		String key = (dto.getId() != null ? dto.getId().toString() : (dto.getUuid() != null ? dto.getUuid() : null));
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





package ma.sg.its.octroicreditcore.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import jakarta.persistence.*;
import ma.sg.its.octroicreditcore.dto.PropertyDto;
import ma.sg.its.octroicreditcore.dto.RangDto;

import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

@Entity
@Table(name = "beneficiary")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Beneficiary extends BaseEntity {
    @ManyToMany(cascade = {CascadeType.PERSIST, CascadeType.MERGE})
    @JoinTable( name = "beneficiary_property", joinColumns = @JoinColumn(name = "beneficiary_id"), inverseJoinColumns = @JoinColumn(name = "property_id") )
    private List<Property> properties;

    private String firstname;
    private String lastname;
    @Column(columnDefinition = "text")
    private String address;
    private String idCardNumber;
    @Column(columnDefinition = "DATE")
    private LocalDate issuedAt;
    private boolean adult;
    private Boolean isGuarantor;
    private Boolean isBorrower;
    private String representativeLastname;
    private String representativeFirstname;
    private LocalDate judgeAuthorizationDate;
    private String codeBirthPlace;
    @Column(columnDefinition = "DATE")
    private LocalDate birthDate;
    @ManyToOne
    @JoinColumn(name = "dossierId", referencedColumnName = "id")
    private DossierData dossier;

    @OneToMany(mappedBy = "beneficiary", cascade = CascadeType.ALL, fetch = FetchType.LAZY, orphanRemoval = true)
    private List<Rang> rangs =  new ArrayList<>();
    /**
     * Synchronise la table de jointure ManyToMany avec les instances du pool
     */
    public void syncProperties(List<PropertyDto> propertyDtos, Map<String, Property> pool) {
        if (this.properties == null) this.properties = new ArrayList<>();
        this.properties.clear();

        if (propertyDtos != null) {
            for (PropertyDto pd : propertyDtos) {
                String key = pd.getId() != null ? pd.getId().toString() :(pd.getUuid() != null ? pd.getUuid() : null);

                Property pFromPool = pool.get(key);
                if (pFromPool != null) {
                    this.properties.add(pFromPool);
                }
            }
        }
    }
    public void syncRangs(List<RangDto> updatedRangs, Map<String, Property> pool) {
        if(updatedRangs == null) return;

        Map<Long, RangDto> modified = updatedRangs.stream()
                .filter(r -> r.getId() != null)
                .collect(Collectors.toMap(RangDto::getId, r -> r));

        this.getRangs().removeIf(r -> r.getId() != null && !modified.containsKey(r.getId()));

        for (Rang r : this.getRangs()) {
            RangDto updatedR = modified.get(r.getId());
            if (updatedR != null) {
                r.setRang(updatedR.getRang());
                r.setWarrantyAmount(updatedR.getWarrantyAmount());
                r.setBeneficiary(this);
                if (updatedR.getPropertyId() != null || updatedR.getPropertyUuid() != null) {
                    String key = updatedR.getPropertyId() != null
                            ? updatedR.getPropertyId().toString()
                            : updatedR.getPropertyUuid();
                    Property property = pool.get(key);
                    if (property != null) {
                        r.setProperty(property);
                    }
                }
            }
        }

        updatedRangs.stream()
                .filter(r -> r.getId() == null)
                .forEach(r -> {
                    String key = r.getPropertyId() != null
                            ? r.getPropertyId().toString()
                            : r.getPropertyUuid();

                    if (key == null) return;

                    Property property = pool.get(key);
                    if (property == null) return;

                    Rang newR = new Rang();
                    newR.setBeneficiary(this);
                    newR.setProperty(property);
                    newR.setRang(r.getRang());
                    newR.setWarrantyAmount(r.getWarrantyAmount());
                    this.getRangs().add(newR);
                });
    }
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        Beneficiary other = (Beneficiary) o;

        if (this.getId() != null && other.getId() != null) {
            return this.getId().equals(other.getId());
        }
        if (this.getUuid() != null && other.getUuid() != null) {
            return this.getUuid().equalsIgnoreCase(other.getUuid());
        }
        return false;
    }

    @Override
    public int hashCode() {
        if (getId() != null) {
            return getId().hashCode();
        }

        if (getUuid() != null) {
            return getUuid().hashCode();
        }

        return 0;
    }


}



package ma.sg.its.octroicreditcore.model;

import jakarta.persistence.*;
import lombok.*;
import ma.sg.its.octroicreditcore.enumeration.AccordType;
import ma.sg.its.octroicreditcore.model.comments.Comment;
import org.springframework.lang.Nullable;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;

@Entity
@Table(name = "dossier")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = false)
@ToString(exclude = {"dossierUsers", "guarantors", "beneficiaries", "dossierAttachmentTypes", "comments", "customerData",
		"warranties", "restrictions", "properties", "dossierReturnDecisions"})
public class DossierData extends BaseEntity {

	private String codeProduct;

	@OneToMany(mappedBy = "dossier", cascade = CascadeType.ALL, fetch = FetchType.LAZY, orphanRemoval = true)
	private List<Property> properties;

	@OneToMany(mappedBy = "dossier", cascade = CascadeType.ALL, fetch = FetchType.LAZY, orphanRemoval = true)
	private List<Beneficiary> beneficiaries;

	@OneToMany(mappedBy = "dossier", cascade = CascadeType.PERSIST, fetch = FetchType.LAZY)
	private Set<DossierUser> dossierUsers;

	@OneToMany(mappedBy = "dossier", cascade = CascadeType.ALL, fetch = FetchType.LAZY, orphanRemoval = true)
	private List<Guarantor> guarantors;

	@OneToMany(mappedBy = "dossier", fetch = FetchType.LAZY)
	private List<DossierAttachmentType> dossierAttachmentTypes;

	@OneToOne(cascade = CascadeType.ALL, orphanRemoval = true)
	@JoinColumn(name = "notary_id", referencedColumnName = "id")
	@Nullable
	private Notary notary;

    @OneToMany(mappedBy = "dossier", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<Representative> representatives;

	@OneToMany(mappedBy = "dossier", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
	@OrderBy("createdAt DESC")
	private List<Comment> comments;

	@OneToOne(cascade = CascadeType.ALL, orphanRemoval = true)
	@JoinColumn(name = "employer_id", referencedColumnName = "id")
	private Employer employer;

	@ManyToOne(cascade = {CascadeType.MERGE, CascadeType.PERSIST})
	@JoinColumn(name = "customer_card_id", referencedColumnName = "id")
	private CustomerCard customerData;

	@OneToMany(mappedBy = "dossier", cascade = CascadeType.ALL, fetch = FetchType.LAZY, orphanRemoval = true)
	private List<Warranty> warranties;

	@OneToMany(mappedBy = "dossier", cascade = CascadeType.ALL, fetch = FetchType.LAZY, orphanRemoval = true)
	private List<Restriction> restrictions;

	@Embedded
	private FinancialData financialData;

	@Embedded
	private LoanData loanData;

	@Embedded
	private InsuranceData insuranceData;

	private Boolean coFinancing;

	private String status;
	@ManyToMany(cascade = CascadeType.ALL)
	@JoinTable(name = "dossierDebts", joinColumns = @JoinColumn(name = "dossier_id"), inverseJoinColumns = @JoinColumn(name = "debt_id"))
	private List<Debt> debts;

	@ManyToMany(cascade = CascadeType.REMOVE)
	@JoinTable(name = "dossierDebtsInfon", joinColumns = @JoinColumn(name = "dossier_id"), inverseJoinColumns = @JoinColumn(name = "debtInfon_id"))
	private List<DebtInfon> debtsinfon;

	@ManyToOne(cascade = CascadeType.PERSIST)
	@JoinColumn(name = "dossier_organization_id", referencedColumnName = "id")
	private DossierOrganization dossierOrganization;

	private LocalDate opcDeliveryDate;
	private LocalDate dateOfReceiptOpcSigned;
	private LocalDate minuteRequestCommitmentDate;
	private LocalDate dateOfReceiptMinuteAndCommitment;
	private LocalDate dateOfReceiptPhysicalFile;

	@OneToMany(mappedBy = "dossier")
	private List<DossierReturnDecision> dossierReturnDecisions;
	private String assignee;
	private Boolean poolCandidate;
	private String riskDecisionEntity;
	private LocalDateTime firstReleasedDate;

	private Boolean hasTaskExpertise;

	@Embedded
	private CcgCommessionMatrix CcgCommessionMatrix;

	@Enumerated(EnumType.STRING)
	private AccordType accord;
	private String prospectUuid;
    private String flowStatus;
}



package ma.sg.its.octroicreditcore.model;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

@Entity
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(callSuper = false)
public class Rang {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Integer rang;
    private BigDecimal warrantyAmount;
    @ManyToOne
    @JoinColumn(name = "propertyId", referencedColumnName = "id")
    private Property property;

    @ManyToOne
    @JoinColumn(name = "beneficiaryId", referencedColumnName = "id")
    private Beneficiary beneficiary;
}


