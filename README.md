  Détail : Failing row contains (16, 7a7d77d6-3c4d-4bc4-9bbd-5057dc1414ea, 0, 38, null, 2026-06-25, 2026-06-10 10:56:30.920607, 2026-06-10 10:56:30.920607).
2026-06-10T12:03:26.927+01:00 ERROR 23096 --- [OCTROI-CREDIT-CORE-PP] [nio-8083-exec-4] [                                                 ] o.a.c.c.C.[.[.[/].[dispatcherServlet]    : Servlet.service() for servlet [dispatcherServlet] in context with path [] threw exception [Request processing failed: org.springframework.dao.DataIntegrityViolationException: could not execute statement [ERROR: null value in column "guarantor_id" of relation "representative_guarantor" violates not-null constraint
  Détail : Failing row contains (16, 7a7d77d6-3c4d-4bc4-9bbd-5057dc1414ea, 0, 38, null, 2026-06-25, 2026-06-10 10:56:30.920607, 2026-06-10 10:56:30.920607).] [update representative_guarantor set created_at=?,guarantor_id=?,proxy_date=?,representative_id=?,updated_at=?,uuid=?,version=? where id=? and version=?]; SQL [update representative_guarantor set created_at=?,guarantor_id=?,proxy_date=?,representative_id=?,updated_at=?,uuid=?,version=? where id=? and version=?]; constraint [guarantor_id" of relation "representative_guarantor]] with root cause

org.postgresql.util.PSQLException: ERROR: null value in column "guarantor_id" of relation "representative_guarantor" violates not-null constraint
  Détail : Failing row contains (16, 7a7d77d6-3c4d-4bc4-9bbd-5057dc1414ea, 0, 38, null, 2026-06-25, 2026-06-10 10:56:30.920607, 2026-06-10 10:56:30.920607).




  package ma.sg.its.octroicreditcore.model;

import jakarta.persistence.*;
import lombok.*;
import ma.sg.its.octroicreditcore.dto.RangDto;
import ma.sg.its.octroicreditcore.dto.RepresentativeBeneficiaryDto;
import ma.sg.its.octroicreditcore.dto.RepresentativeDto;
import ma.sg.its.octroicreditcore.dto.RepresentativeGuarantorDto;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Entity
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = false)
public class Representative extends AbstractEntity {
    private String firstname;
    private String lastname;
    private String cin;
    private LocalDate cinIssuedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "dossierId", referencedColumnName = "id")
    private DossierData dossier;

    @OneToMany(mappedBy = "representative", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    private List<RepresentativeBeneficiary> beneficiaryAssociations = new ArrayList<>();

    @OneToMany(mappedBy = "representative", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    private List<RepresentativeGuarantor> guarantorAssociations = new ArrayList<>();

    @OneToMany(mappedBy = "representative", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    private List<RepresentativeCustomer> customerAssociations = new ArrayList<>();


    public void unlinkAllGuarantors() {
        if (this.guarantorAssociations == null) this.guarantorAssociations = new ArrayList<>();
        this.guarantorAssociations.clear();
    }

    public void unlinkAllBeneficiaries() {
        if (this.beneficiaryAssociations == null) this.beneficiaryAssociations = new ArrayList<>();
        this.beneficiaryAssociations.clear();
    }

    public void unlinkAllCustomers() {
        if (this.customerAssociations == null) this.customerAssociations = new ArrayList<>();
        this.customerAssociations.clear();
    }

    public void syncBeneficiaries(List<RepresentativeBeneficiaryDto> repBeneficiaries, Map<String, Beneficiary> beneficiaryPool) {
        if (this.beneficiaryAssociations == null) {
            this.beneficiaryAssociations = new ArrayList<>();
        }
        this.beneficiaryAssociations.clear();


        if (repBeneficiaries == null || repBeneficiaries.isEmpty()) {
            return;
        }
        for (RepresentativeBeneficiaryDto dto : repBeneficiaries) {
            if (dto.getBeneficiary() == null) {
                continue;
            }

            String key =  dto.getBeneficiary().getId() != null
                    ?  dto.getBeneficiary().getId().toString()
                    :  dto.getBeneficiary().getUuid();
            Beneficiary beneficiary = beneficiaryPool.get(key);

            if (beneficiary != null) {
                RepresentativeBeneficiary newLink = RepresentativeBeneficiary.builder()
                        .representative(this)
                        .beneficiary(beneficiary)
                        .proxyDate(dto.getProxyDate())
                        .build();
                this.beneficiaryAssociations.add(newLink);
            }
        }
    }

    public void syncGuarantors(List<RepresentativeGuarantorDto> guarantorDtos, Map<String, Guarantor> guarantorPool) {
        if(guarantorDtos == null) return;
        Map<Long, RepresentativeGuarantorDto> modified = guarantorDtos.stream()
                .filter(r -> r.getId() != null)
                .collect(Collectors.toMap(RepresentativeGuarantorDto::getId, r -> r));

        this.getGuarantorAssociations().removeIf(r -> r.getGuarantor() != null && r.getGuarantor().getId() != null
                && !guarantorPool.containsKey(r.getGuarantor().getId().toString()));

        for (RepresentativeGuarantor r : this.getGuarantorAssociations()) {
            RepresentativeGuarantorDto updatedR = modified.get(r.getId());
            if (updatedR != null) {
                r.setProxyDate(updatedR.getProxyDate());
                r.setRepresentative(this);
                if (updatedR.getGuarantor().getId() != null || updatedR.getGuarantor().getUuid() != null) {
                    String key = updatedR.getGuarantor().getId() != null
                            ? updatedR.getGuarantor().getId().toString()
                            : updatedR.getGuarantor().getUuid();
                    Guarantor guarantor = guarantorPool.get(key);
                    if (guarantor != null) {
                        r.setGuarantor(guarantor);
                    }
                }
            }
        }

        guarantorDtos.stream()
            .filter(r -> r.getId() == null)
            .forEach(r -> {
                String key = r.getGuarantor().getId() != null
                        ? r.getGuarantor().getId().toString()
                        : r.getGuarantor().getUuid();

                if (key == null) return;

                Guarantor guarantor = guarantorPool.get(key);
                if (guarantor == null) return;

                RepresentativeGuarantor newR = new RepresentativeGuarantor();
                newR.setRepresentative(this);
                newR.setGuarantor(guarantor);
                newR.setProxyDate(r.getProxyDate());
                this.getGuarantorAssociations().add(newR);
            });
    }

    public void syncCustomer(RepresentativeDto dto, DossierData dossier) {
        if (this.customerAssociations == null) {
            this.customerAssociations = new ArrayList<>();
        }

        Iterator<RepresentativeCustomer> iterator = this.customerAssociations.iterator();
        while (iterator.hasNext()) {
            RepresentativeCustomer association = iterator.next();
            association.setRepresentative(null);
            association.setCustomer(null);
            iterator.remove();
        }
        if (dto.getCustomer() == null || dossier.getCustomerData() == null) {
            return;
        }

        Customer customer = dossier.getCustomerData().getCustomer();
        if (customer != null) {
            RepresentativeCustomer association = new RepresentativeCustomer();
            association.setRepresentative(this);
            association.setCustomer(customer);
            association.setProxyDate(dto.getCustomer().getProxyDate());
            this.customerAssociations.add(association);
        }
    }
}












// SERVICE


package ma.sg.its.octroicreditcore.service;

import lombok.AllArgsConstructor;
import lombok.NoArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import ma.sg.its.octroicreditcore.Specification.DossierKpiSpecification;
import ma.sg.its.octroicreditcore.dto.*;
import ma.sg.its.octroicreditcore.dto.kpi.KpiDossierData;
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
	private RepresentativeMapper representativeMapper;

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

		Map<String, Beneficiary> beneficiaryPool = new HashMap<>();
		Map<String, Guarantor> guarantorPool = new HashMap<>();
		linkPropertiesToBeneficiaries(dossierDto, oldDossier, beneficiaryPool);
		syncGuarantors(dossierDto, oldDossier, guarantorPool);
		syncRepresentatives(dossierDto, oldDossier, beneficiaryPool, guarantorPool);

		prepareDossier(oldDossier);
		// set dossier-user relationship if exist
		if (dossierDto.getDossierUsers() != null)
			insertDossierUser(dossierDto, oldDossier);

		oldDossier.setAssignee(newDossier.getAssignee());
		oldDossier.setPoolCandidate(newDossier.getPoolCandidate());
		oldDossier.setHasTaskExpertise(newDossier.getHasTaskExpertise());
		if(!AccordType.DEFINITIF.equals(oldDossier.getAccord())){
			oldDossier.setAccord(newDossier.getAccord());
		}

		if(newDossier.getProspectUuid()!=null){
			oldDossier.setProspectUuid(newDossier.getProspectUuid());
		}
		oldDossier.setFlowStatus(newDossier.getFlowStatus());

		DossierData updatedData = dossierDataRepository.save(oldDossier);
		return convertToDto(updatedData);
	}
    public void syncGuarantors(DossierDataDto newDossier, DossierData dossier, Map<String, Guarantor> guarantorPool) {
		if (CollectionUtils.isEmpty(newDossier.getGuarantors())) {
			dossier.getGuarantors().clear();
			return;
		}
		Map<Long, GuarantorDto> incomingIds = newDossier.getGuarantors().stream()
				.filter(r -> r.getId() != null)
				.collect(Collectors.toMap(GuarantorDto::getId, r -> r));

		dossier.getGuarantors().removeIf(r -> r.getId() != null && !incomingIds.containsKey(r.getId()));

		dossier.getGuarantors().forEach(rep -> {
			if(incomingIds.containsKey(rep.getId())){
				GuarantorDto repDto = incomingIds.get(rep.getId());
				guarantorMapper.updateFromDto(repDto, rep);
				if (rep.getId() != null) {
					guarantorPool.put(rep.getId().toString(), rep);
				}
				if (rep.getUuid() != null) {
					guarantorPool.put(rep.getUuid(), rep);
				}
			}
		});

		for (GuarantorDto repDto : newDossier.getGuarantors()) {
			if (repDto.getId() == null) {
				Guarantor guarantor = guarantorMapper.convertToEntity(repDto);
				guarantor.setDossier(dossier);

				dossier.getGuarantors().add(guarantor);

				if (repDto.getUuid() != null) {
					guarantorPool.put(repDto.getUuid(), guarantor);
				}
			}
		}
    }

    public void syncRepresentatives(
			DossierDataDto newDossier,
			DossierData dossier,
			Map<String, Beneficiary> beneficiaryPool,
			Map<String, Guarantor> guarantorPool) {

        if (CollectionUtils.isEmpty(newDossier.getRepresentatives())) {
            dossier.getRepresentatives().clear();
			return;
        }
		Map<Long, RepresentativeDto> incomingIds = newDossier.getRepresentatives().stream()
				.filter(r -> r.getId() != null)
				.collect(Collectors.toMap(RepresentativeDto::getId, r -> r));

        dossier.getRepresentatives().removeIf(r -> r.getId() != null && !incomingIds.containsKey(r.getId()));

		dossier.getRepresentatives().forEach(rep -> {
			if(incomingIds.containsKey(rep.getId())){
				RepresentativeDto repDto = incomingIds.get(rep.getId());
				representativeMapper.updateEntityFromDto(repDto, rep);
				rep.syncBeneficiaries(repDto.getBeneficiaries(), beneficiaryPool);
				rep.syncGuarantors(repDto.getGuarantors(), guarantorPool);
				rep.syncCustomer(repDto, dossier);
			}
		});

		for (RepresentativeDto repDto : newDossier.getRepresentatives()) {
			if (repDto.getId() == null) {
				Representative representative = representativeMapper.toEntity(repDto);
				representative.setDossier(dossier);
				representative.syncBeneficiaries(repDto.getBeneficiaries(), beneficiaryPool);
				representative.syncGuarantors(repDto.getGuarantors(), guarantorPool);
				representative.syncCustomer(repDto, dossier);
				dossier.getRepresentatives().add(representative);
			}
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
	private void linkPropertiesToBeneficiaries(DossierDataDto dto, DossierData existingDossier, Map<String, Beneficiary> beneficiaryPool) {
		initializeCollections(existingDossier);
		Map<String, Property> propertyPool = new HashMap<>();

		if (dto.getPropertyData() != null && dto.getPropertyData().getProperties() != null) {
			processProperties(dto.getPropertyData().getProperties(), existingDossier, propertyPool);
		}else{
			existingDossier.getProperties().clear();
		}

		if (dto.getBeneficiaries() != null) {
			syncBeneficiaries(dto.getBeneficiaries(), existingDossier, propertyPool, beneficiaryPool);
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

	private void syncBeneficiaries(List<BeneficiaryDto> dtos, DossierData dossier, Map<String, Property> pool, Map<String, Beneficiary> beneficiaryPool) {
		if (dossier.getBeneficiaries() == null) dossier.setBeneficiaries(new ArrayList<>());

		Map<Long, BeneficiaryDto> dtoMap = dtos.stream()
				.filter(p -> p.getId() != null)
				.collect(Collectors.toMap(BeneficiaryDto::getId, p -> p));

		dossier.getBeneficiaries().stream()
            .filter(b -> b.getId() != null && !dtoMap.containsKey(b.getId()))
            .forEach(b -> b.getRangs().clear());
			
		dossier.getBeneficiaries().removeIf(p -> p.getId() != null && !dtoMap.containsKey(p.getId()));

		dossier.getBeneficiaries().forEach(benef -> {
			if(dtoMap.containsKey(benef.getId())){
				BeneficiaryDto bDto = dtoMap.get(benef.getId());
				beneficiaryMapper.updateFromDto(bDto, benef);
				benef.syncProperties(bDto.getProperties(), pool);
				benef.syncRangs(bDto.getRangs(), pool);
				if (benef.getId() != null) {
					beneficiaryPool.put(benef.getId().toString(), benef);
				}
				if (benef.getUuid() != null) {
					beneficiaryPool.put(benef.getUuid(), benef);
				}
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

					if (beneficiary.getUuid() != null) {
						beneficiaryPool.put(beneficiary.getUuid(), beneficiary);
					}
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
