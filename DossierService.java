package ma.sg.its.octroicreditcore.model;

import jakarta.persistence.*;
import lombok.*;
import ma.sg.its.octroicreditcore.dto.RangDto;
import org.hibernate.annotations.Fetch;
import org.hibernate.annotations.FetchMode;

import java.time.LocalDate;
import java.util.*;
import java.util.function.Predicate;
import java.util.stream.Collectors;

@Entity
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(callSuper = false)
public class Property {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "land_certificate_number")
    private String landCertificateNumber;
    @Column(name = "code_property_city")
    private String codePropertyCity;

    private String descriptionBien;
    private Double propertyArea;
    private String denomination;
    private String propertyType;
    private LocalDate date;
    private String purchaseProof;
    private String reference;
    private Boolean inVsbProgram;
    private String companyName;
    private String capital;
    private String companyAddress;
    private String registerNumber;
    private String areaDelimitation;
    private String deposit;
    private LocalDate cpvDate;
    private String page;
    private String exactAdress;
    private String immoProgramName;
    @Column(name = "for_acquisition")
    private Boolean forAcquisition;
    @ManyToOne
    @JoinColumn(name = "dossierId", referencedColumnName = "id")
    private DossierData dossier;

    @ManyToOne
    @JoinColumn(name = "requestId", referencedColumnName = "id")
    private DossierRequest dossierRequest;

    @OneToMany(mappedBy = "property", cascade = {}, fetch = FetchType.LAZY, orphanRemoval = false)
    private List<Rang> rangs =  new ArrayList<>();

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

    @ManyToOne
    @JoinColumn(name = "requestId", referencedColumnName = "id")
    private DossierRequest dossierRequest;

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

import lombok.*;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.util.Objects;

@Entity
@Table(name = "guarantor")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = false)
public class Guarantor extends BaseEntity {

    @Column(nullable = false)
    private String firstName;
    @Column(nullable = false)
    private String lastName;
    @Column(columnDefinition = "text")
    private String address;
    @Column(unique = false, nullable = false)
    private String idCardNumber;
    @Column(columnDefinition = "DATE")
    private LocalDate issuedAt;
    private Boolean isBeneficiary;
    private Boolean isBorrower;
    @ManyToOne
    @JoinColumn(name = "dossierId", referencedColumnName = "id")
    private DossierData dossier;

    @ManyToOne
    @JoinColumn(name = "requestId", referencedColumnName = "id")
    private DossierRequest dossierRequest;

    private String codeBirthPlace;
    @Column(columnDefinition = "DATE")
    private LocalDate birthDate;
    @Override
    public boolean equals(Object o) {
        if (o == null) {
            return false;
        }

        if (o.getClass() != this.getClass()) {
            return false;
        }

        final Guarantor other = (Guarantor) o;
        return Objects.equals(idCardNumber, other.idCardNumber);
    }

    @Override
    public int hashCode() {
        int result = uuid != null ? uuid.hashCode() : 0;
        result = 31 * result + (idCardNumber != null ? idCardNumber.hashCode() : 0);
        return result;
    }
}

package ma.sg.its.octroicreditcore.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.util.*;

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

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "requestId", referencedColumnName = "id")
    private DossierData dossierRequest;

    @OneToMany(mappedBy = "representative", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    private List<RepresentativeBeneficiary> beneficiaryAssociations = new ArrayList<>();

    @OneToMany(mappedBy = "representative", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    private List<RepresentativeGuarantor> guarantorAssociations = new ArrayList<>();

    @OneToMany(mappedBy = "representative", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    private List<RepresentativeCustomer> customerAssociations = new ArrayList<>();

    public void linkBeneficiary(Beneficiary beneficiary, LocalDate proxyDate) {
        if (beneficiary != null) {
            RepresentativeBeneficiary association = new RepresentativeBeneficiary();
            association.setRepresentative(this);
            association.setBeneficiary(beneficiary);
            association.setProxyDate(proxyDate);
            this.beneficiaryAssociations.add(association);
        }
    }

    public void linkGuarantor(Guarantor guarantor, LocalDate proxyDate) {
        if (guarantor != null) {
            RepresentativeGuarantor association = new RepresentativeGuarantor();
            association.setRepresentative(this);
            association.setGuarantor(guarantor);
            association.setProxyDate(proxyDate);
            this.guarantorAssociations.add(association);
        }
    }

    public void linkCustomer(Customer customer, LocalDate proxyDate) {
        if (customer != null) {
            RepresentativeCustomer association = new RepresentativeCustomer();
            association.setRepresentative(this);
            association.setCustomer(customer);
            association.setProxyDate(proxyDate);
            this.customerAssociations.clear();
            this.customerAssociations.add(association);
        }
    }

    public void unlinkAllGuarantors() {
        this.guarantorAssociations.clear();
    }

    public void unlinkAllBeneficiaries() {
        this.beneficiaryAssociations.clear();
    }

    public void unlinkAllCustomers() {
        this.customerAssociations.clear();
    }
}




package ma.sg.its.octroicreditcore.service;

import jakarta.persistence.EntityNotFoundException;
import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import ma.sg.its.octroicreditcore.dto.BeneficiaryDto;
import ma.sg.its.octroicreditcore.dto.DossierRequestDto;
import ma.sg.its.octroicreditcore.dto.PropertyDto;
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
        validateRequestDto(newRequestDto);

        DossierData dossierData = loadDossierData(newRequestDto.getDossier().getUuid());

        closePreviousRequest(newRequestDto.getDossier().getUuid());

        DossierRequest newRequest = dossierRequestMapper.convertToEntity(newRequestDto);
        newRequest.setId(null);
        newRequest.setDossier(dossierData);

        linkWarrantiesToRequest(newRequestDto, newRequest);
        linkPropertiesToBeneficiaries(newRequestDto, newRequest);

        DossierRequest saved = dossierRequestRepository.save(newRequest);
        log.info("DossierRequest créé uuid={}", saved.getUuid());

        return dossierRequestMapper.convertToDTO(saved);
    }

    @Transactional
    public DossierRequestDto updateDossierRequest(DossierRequestDto dossierRequestDto) {
        validateRequestDto(dossierRequestDto);

        DossierRequest existingDossierRequest = getLastDossierRequestInProgress(dossierRequestDto.getDossier().getUuid())
                .orElseThrow(() -> new TechnicalException("Dossier request not found"));

        existingDossierRequest.setRequestStatus(dossierRequestDto.getRequestStatus());
        existingDossierRequest.setDecisionDate(LocalDateTime.now());
        existingDossierRequest.setDecidedBy(userMapper.convertToEntity(dossierRequestDto.getDecidedBy()));
        if (FINAL_STATUSES.contains(dossierRequestDto.getRequestStatus())) {
            saveReturnDecision(existingDossierRequest);
        }

        DossierRequest updatedEntity = dossierRequestRepository.save(existingDossierRequest);
        return dossierRequestMapper.convertToDTO(updatedEntity);
    }
    private void saveReturnDecision(DossierRequest request) {
        DossierReturnDecision decision = DossierReturnDecision.builder()
                .dossier(request.getDossier())          // déjà managé
                .statusDossier(request.getStageDossier())
                .tries(1)
                .build();
        dossierReturnDecisionRepository.save(decision);
    }

    private void validateRequestDto(DossierRequestDto dto) {
        if (dto == null || dto.getDossier() == null || dto.getDossier().getUuid() == null) {
            throw new TechnicalException(INVALID_OR_NULL_DOSSIER_REQUEST_DTO);
        }
    }

    private DossierData loadDossierData(String uuid) {
        return Optional.ofNullable(dossierDataRepository.findByUuid(uuid))
                .orElseThrow(() -> new EntityNotFoundException("Dossier introuvable : " + uuid));
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
                        warranty.setId(null);
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
        Map<String, RequestProperty> propertyRegistry = buildPropertyRegistry(dto, newRequest);

        if (dto.getBeneficiaries() != null) {
            List<RequestBeneficiary> beneficiaries = dto.getBeneficiaries().stream()
                    .map(bDto -> buildBeneficiary(bDto, newRequest, propertyRegistry))
                    .toList();
            newRequest.setBeneficiaries(beneficiaries);
        }

        newRequest.setProperties(new ArrayList<>(propertyRegistry.values()));
    }

    private Map<String, RequestProperty> buildPropertyRegistry(DossierRequestDto dto, DossierRequest newRequest) {
        Map<String, RequestProperty> registry = new LinkedHashMap<>();

        if (dto.getPropertyData() == null
                || dto.getPropertyData().getProperties() == null
                || dto.getPropertyData().getProperties().isEmpty()) {
            return registry;
        }

        dto.getPropertyData().getProperties().forEach(pDto -> {
            String key = resolvePropertyKey(pDto);
            registry.computeIfAbsent(key, k -> createFreshProperty(pDto, newRequest));
        });

        return registry;
    }

    private String resolvePropertyKey(PropertyDto pDto) {
        return pDto.getId() != null ? pDto.getId().toString() : pDto.getUuid();
    }

    private RequestProperty createFreshProperty(PropertyDto pDto, DossierRequest newRequest) {
        pDto.setId(null);

        RequestProperty prop = propertyMapper.convertToRequestEntity(pDto);
        prop.setId(null);
        prop.setDossierRequest(newRequest);

        return prop;
    }

    private RequestBeneficiary buildBeneficiary(
            BeneficiaryDto bDto,
            DossierRequest newRequest,
            Map<String, RequestProperty> registry
    ) {
        RequestBeneficiary beneficiary = beneficiaryMapper.convertToRequestEntity(bDto);
        beneficiary.setId(null);
        beneficiary.setDossierRequest(newRequest);

        if (bDto.getProperties() != null) {
            List<RequestProperty> linkedProps = bDto.getProperties().stream()
                .map(pDto -> {
                    String key = resolvePropertyKey(pDto);
                    return registry.computeIfAbsent(key, k -> createFreshProperty(pDto, newRequest));
                })
                .toList();
            beneficiary.setProperties(linkedProps);
            beneficiary.syncRangs(bDto.getRangs(),registry);
        }

        return beneficiary;
    }
}
