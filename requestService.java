package ma.sg.its.octroicreditcore.service;

import jakarta.persistence.EntityNotFoundException;
import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import ma.sg.its.octroicreditcore.dto.DossierRequestDto;
import ma.sg.its.octroicreditcore.enumeration.RequestStatus;
import ma.sg.its.octroicreditcore.exception.TechnicalException;
import ma.sg.its.octroicreditcore.mapper.*;
import ma.sg.its.octroicreditcore.model.*;
import ma.sg.its.octroicreditcore.repository.DossierDataRepository;
import ma.sg.its.octroicreditcore.repository.DossierRequestRepository;
import ma.sg.its.octroicreditcore.repository.DossierReturnDecisionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;

@Service
@Transactional
@Slf4j
@AllArgsConstructor
public class DossierRequestService {

    private final DossierRequestRepository dossierRequestRepository;
    private final DossierRequestMapper dossierRequestMapper;
    private final RequestWarrantyMapper requestWarrantyMapper;
    private final DossierReturnDecisionRepository dossierReturnDecisionRepository;
    private final DossierDataRepository dossierDataRepository;
    private final UserMapper userMapper;
    private final BeneficiaryMapper beneficiaryMapper;
    private final PropertyMapper propertyMapper;


    public static final String INVALID_OR_NULL_DOSSIER_REQUEST_DTO = "Invalid or null dossier request DTO";
    private static final List<String> FINAL_STATUSES = List.of(
            RequestStatus.REJECTED.toString(),
            RequestStatus.ACCEPTED.toString(),
            RequestStatus.CLOSED.toString()
    );


    public List<DossierRequestDto> getDossierRequests(String dossierUuid) {
        return dossierRequestMapper.mapToListDto(dossierRequestRepository.findAllByDossierUuid(dossierUuid));
    }

    public DossierRequestDto getDossierRequestByUuid(String uuid) {
        return dossierRequestMapper.convertToDTO(dossierRequestRepository.findByUuid(uuid));
    }
    @Transactional
    public DossierRequestDto createDossierRequest(DossierRequestDto newRequestDto) {
        if(newRequestDto == null || newRequestDto.getDossier() == null) {
            throw new TechnicalException(INVALID_OR_NULL_DOSSIER_REQUEST_DTO);
        }

        DossierData dossierData = Optional.ofNullable(dossierDataRepository.findByUuid(newRequestDto.getDossier().getUuid()))
                .orElseThrow(() -> new EntityNotFoundException("Dossier introuvable"));


        closePreviousRequest(newRequestDto.getDossier().getUuid());

        DossierRequest newRequest = dossierRequestMapper.convertToEntity(newRequestDto);
        newRequest.setDossier(dossierData);

        linkWarrantiesToRequest(newRequestDto, newRequest);
        linkPropertiesToBeneficiaries(newRequestDto, newRequest);
        DossierRequest savedNewRequest = dossierRequestRepository.save(newRequest);
        return dossierRequestMapper.convertToDTO(savedNewRequest);
    }

    @Transactional
    public DossierRequestDto updateDossierRequest(DossierRequestDto dossierRequestDto) {
        if (dossierRequestDto.getDossier() == null || dossierRequestDto.getDossier().getUuid() == null) {
            throw new TechnicalException(INVALID_OR_NULL_DOSSIER_REQUEST_DTO);
        }

        DossierRequest existingDossierRequest = getLastDossierRequestInProgress(dossierRequestDto.getDossier().getUuid())
                .orElseThrow(() -> new TechnicalException("Dossier request not found"));

        existingDossierRequest.setRequestStatus(dossierRequestDto.getRequestStatus());
        existingDossierRequest.setDecisionDate(LocalDateTime.now());
        existingDossierRequest.setDecidedBy(userMapper.convertToEntity(dossierRequestDto.getDecidedBy()));
        if (FINAL_STATUSES.contains(dossierRequestDto.getRequestStatus())) {
            DossierReturnDecision dossierReturnDecision = DossierReturnDecision.builder()
                    .dossier(existingDossierRequest.getDossier())
                    .statusDossier(existingDossierRequest.getStageDossier())
                    .tries(1)
                    .build();
            dossierReturnDecisionRepository.save(dossierReturnDecision);
        }

        DossierRequest updatedEntity = dossierRequestRepository.save(existingDossierRequest);
        return dossierRequestMapper.convertToDTO(updatedEntity);
    }

    private void closePreviousRequest(String dossierUuid) {
        dossierRequestRepository.findFirstByRequestStatusAndDossierUuidOrderByCreatedAtDesc(
                RequestStatus.IN_PROGRESS.toString(),
                dossierUuid
        ).ifPresent(last -> {
            last.setRequestStatus(RequestStatus.CLOSED.toString());
            dossierRequestRepository.save(last);
        });
    }

    private void linkWarrantiesToRequest(DossierRequestDto newRequestDto, DossierRequest newRequest) {
        if (newRequestDto.getRequestWarranties() != null) {
            List<RequestWarranty> warranties = newRequestDto.getRequestWarranties().stream()
                    .map(warrantyDto -> {
                        RequestWarranty warranty = requestWarrantyMapper.toEntity(warrantyDto);
                        warranty.setDossierRequest(newRequest);
                        return warranty;
                    }).toList();

            newRequest.setRequestWarranties(warranties);
        }
    }

    private Optional<DossierRequest> getLastDossierRequestInProgress(String dossierUuid){
        return dossierRequestRepository.findFirstByRequestStatusAndDossierUuidOrderByCreatedAtDesc(
                RequestStatus.IN_PROGRESS.toString(),
                dossierUuid
        );
    }

    private void linkPropertiesToBeneficiaries(DossierRequestDto dto, DossierRequest newRequest) {
        Map<String, RequestProperty> propertyInstances = new HashMap<>();

        if (dto.getPropertyData() != null && dto.getPropertyData().getProperties() != null && !dto.getPropertyData().getProperties().isEmpty()) {
            dto.getPropertyData().getProperties().forEach(pDto -> {
                String key = pDto.getId() == null ? pDto.getUuid() : pDto.getId().toString();
                propertyInstances.computeIfAbsent(key, k -> {
                    RequestProperty prop = propertyMapper.convertToRequestEntity(pDto);
                    prop.setId(null);
                    if (prop.getRangs() != null) prop.getRangs().forEach(r -> r.setId(null));
                    return prop;
                });
            });
        }
        if (dto.getBeneficiaries() != null) {
            List<RequestBeneficiary> beneficiaries = dto.getBeneficiaries().stream()
                .map(bDto -> {
                    RequestBeneficiary beneficiary = beneficiaryMapper.convertToRequestEntity(bDto);
                    beneficiary.setDossierRequest(newRequest);

                    if (bDto.getProperties() != null) {
                        List<RequestProperty> linkedProps = bDto.getProperties().stream()
                            .map(pDto -> {
                                String key = pDto.getId() == null ? pDto.getUuid() : pDto.getId().toString();
                                pDto.setId(null);
                                if (pDto.getRangs() != null) pDto.getRangs().forEach(r-> r.setId(null));
                                return propertyInstances.computeIfAbsent(key, k -> propertyMapper.convertToRequestEntity(pDto));
                            }).toList();
                        beneficiary.setProperties(linkedProps);
                    }
                    return beneficiary;
                }).toList();
            newRequest.setBeneficiaries(beneficiaries);
        }

        List<RequestProperty> allUniqueProperties = new ArrayList<>(propertyInstances.values());
        newRequest.setProperties(allUniqueProperties);
    }

}




@Entity
@Table(name = "dossier_request")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = false)
public class DossierRequest extends BaseEntity {
    @ManyToOne
    @JoinColumn(name = "dossier_id", referencedColumnName = "id")
    private DossierData dossier;
    private BigDecimal claimedAmountOfPurchase;
    private BigDecimal claimedAmountOfBuildDevelopment;

    private BigDecimal requestedNotaryFee;
    private BigDecimal subsidizedCreditAmount;
    private BigDecimal bonusCreditAmount;
    private BigDecimal suportedCreditAmount;
    private Integer subsidizedCreditDuration;
    private Integer bonusCreditDuration;
    private Integer suportedCreditDuration;
    private Double subsidizedCreditRate;
    private Double bonusCreditRate;
    private Double suportedCreditRate;

    private Double cappedRate;
    private String typeRate;
    private Double creditRate;
    private BigDecimal applicationFee;
    private BigDecimal insuranceCoefficient;
    private BigDecimal insuredPercentage;
    private BigDecimal promotionalInsuranceRate;

    private BigDecimal 	subsidizedInsuredPercentage;
    private BigDecimal	subsidizedPromotionalInsuranceRate;
    private BigDecimal	subsidizedInsuranceCoefficient;
    private BigDecimal	bonusInsuredPercentage;
    private BigDecimal	bonusPromotionalInsuranceRate;
    private BigDecimal	bonusInsuranceCoefficient;
    private BigDecimal 	suportedInsuredPercentage;
    private BigDecimal	suportedPromotionalInsuranceRate;
    private BigDecimal	suportedInsuranceCoefficient;

    private BigDecimal	typeBInsuredPercentage;
    private BigDecimal	typeAPromotionalInsuranceRate;
    private BigDecimal	typeBInsuranceCoefficient;

    private BigDecimal 	typeAInsuredPercentage;
    private BigDecimal	typeBPromotionalInsuranceRate;

    private BigDecimal	typeAInsuranceCoefficient;

    private BigDecimal	aditionalCreditInsuredPercentage;

    private BigDecimal	aditionalCreditInsuranceCoefficient;

    private Integer typeBloanDuration;
    private Integer additionalLoanDuration;
    private BigDecimal	aditionalCreditPromotionalInsuranceRate;
    private BigDecimal typeAloanRate;
    private BigDecimal typeBloanRate;
    private Integer typeAloanDuration;

    private BigDecimal additionalCredit;
    private BigDecimal additionalCreditRate;

    private BigDecimal typeAloanAmount;
    private BigDecimal typeBloanAmount;

    private Integer deadlineNumber;
    private String requestStatus;
    private LocalDateTime decisionDate;
    private String comment;
    private String statusDossier;
    private String stageDossier;
    private String delayType;
    private Boolean delayed;
    private Integer delayDuration;
    private String repurchasedCreditNumber;
    private Boolean coFinancing;

    @ManyToOne
    @JoinColumn(name = "created_by", referencedColumnName = "id")
    private User createdBy;
    @ManyToOne
    @JoinColumn(name = "decided_by", referencedColumnName = "id", nullable = true)
    private User decidedBy;

    @OneToMany(mappedBy = "dossierRequest", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<RequestWarranty> requestWarranties;

    @OneToMany(mappedBy = "dossierRequest", cascade = CascadeType.ALL, fetch = FetchType.LAZY, orphanRemoval = true)
    private List<RequestBeneficiary> beneficiaries;

    @OneToMany(mappedBy = "dossierRequest", cascade = CascadeType.ALL, fetch = FetchType.LAZY, orphanRemoval = true)
    private List<RequestProperty> properties;
}



@Entity
@Table(name = "request_beneficiary")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RequestBeneficiary extends BaseEntity {
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
    @JoinColumn(name = "dossierRequestId", referencedColumnName = "id")
    private DossierRequest dossierRequest;
    @ManyToMany
    @JoinTable( name = "request_beneficiary_property", joinColumns = @JoinColumn(name = "request_beneficiary_id"), inverseJoinColumns = @JoinColumn(name = "request_property_id") )
    private List<RequestProperty> properties;

}

@Entity
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(callSuper = false)
public class RequestProperty {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String landCertificateNumber;
    private String codePropertyCity;
    private Boolean forAcquisition;
    private Double propertyArea;
    private String denomination;
    private String propertyType;

    @OneToMany(cascade = CascadeType.ALL, orphanRemoval = true)
    @Fetch(FetchMode.SUBSELECT)
    @JoinColumn(name = "request_property_id", referencedColumnName = "id")
    private List<RequestRang> rangs;
    private LocalDate date;
    private String immoProgramName;
    private String reference;
    private Boolean inVsbProgram;
    private String companyName;
    private String capital;
    private String companyAddress;
    private String registerNumber;
    private String purchaseProof;
    private String areaDelimitation;
    private String deposit;
    private LocalDate cpvDate;
    private String page;
    private String exactAdress;
    private String descriptionBien;
    @ManyToOne
    @JoinColumn(name = "dossierRequestId", referencedColumnName = "id")
    private DossierRequest dossierRequest;
}



