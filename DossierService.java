package ma.sg.its.octroicreditcore.service;

import jakarta.persistence.EntityNotFoundException;
import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import ma.sg.its.octroicreditcore.dto.*;
import ma.sg.its.octroicreditcore.enumeration.RequestStatus;
import ma.sg.its.octroicreditcore.exception.TechnicalException;
import ma.sg.its.octroicreditcore.mapper.*;
import ma.sg.its.octroicreditcore.model.*;
import ma.sg.its.octroicreditcore.repository.DossierDataRepository;
import ma.sg.its.octroicreditcore.repository.DossierRequestRepository;
import ma.sg.its.octroicreditcore.repository.DossierReturnDecisionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.CollectionUtils;

import java.time.LocalDate;
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
    private final RequestRepresentativeMapper representativeMapper;

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
        syncRepresentative(newRequestDto, newRequest);
        if(newRequest.getGuarantors() != null ) newRequest.getGuarantors().forEach(g-> g.setDossierRequest(newRequest));
        DossierRequest saved = dossierRequestRepository.save(newRequest);
        log.info("DossierRequest créé uuid={}", saved.getUuid());

        return dossierRequestMapper.convertToDTO(saved);
    }

    private void syncRepresentative(DossierRequestDto newRequestDto, DossierRequest newRequest) {
        if(newRequest.getRepresentatives() != null) newRequest.getRepresentatives().clear();
        else { newRequest.setRepresentatives(new ArrayList<>());}
        if(newRequestDto.getRepresentatives() != null && !newRequestDto.getRepresentatives().isEmpty()) {
            for (RepresentativeDto repDto : newRequestDto.getRepresentatives()) {
                RequestRepresentative  rep = representativeMapper.toEntity(repDto);
                rep.setDossierRequest(newRequest);
                linkRepresentativeRelationships(repDto, rep, newRequest);
                newRequest.getRepresentatives().add(rep);
            }
        }
    }

    private void linkRepresentativeRelationships(
            RepresentativeDto dto,
            RequestRepresentative entity,
            DossierRequest request) {

        linkCustomerRelationship(dto, entity, request.getDossier());
        linkBeneficiaryRelationships(dto, entity, request);
        linkGuarantorRelationships(dto, entity, request);
    }

    private void linkGuarantorRelationships(RepresentativeDto dto, RequestRepresentative entity, DossierRequest request) {
        if (CollectionUtils.isEmpty(dto.getGuarantors()) || CollectionUtils.isEmpty(request.getGuarantors())) {
            return;
        }

        dto.getGuarantors().forEach(garDto -> linkGuarantor(entity, garDto, request));
    }


    private void linkCustomerRelationship(RepresentativeDto dto, RequestRepresentative entity, DossierData dossier) {
        if (dto.getCustomer() == null || dossier.getCustomerData() == null) {
            return;
        }

        Customer customer = dossier.getCustomerData().getCustomer();
        LocalDate proxyDate = dto.getCustomer().getProxyDate();

        if (customer != null && proxyDate != null) {
            entity.linkCustomer(customer, proxyDate);
        }
    }

    private void linkBeneficiaryRelationships(RepresentativeDto dto, RequestRepresentative entity, DossierRequest request) {
        if (CollectionUtils.isEmpty(dto.getBeneficiaries()) || CollectionUtils.isEmpty(request.getBeneficiaries())) {
            return;
        }

        dto.getBeneficiaries().forEach(benDto -> linkBeneficiary(entity, benDto, request));
    }

    private void linkBeneficiary(RequestRepresentative entity, RepresentativeBeneficiaryDto benDto, DossierRequest request) {
        if (benDto.getBeneficiary() == null || benDto.getProxyDate() == null) {
            return;
        }

        request.getBeneficiaries().stream()
                .filter(b -> isSameBeneficiary(b, benDto.getBeneficiary()))
                .findFirst()
                .ifPresent(beneficiary -> entity.linkBeneficiary(beneficiary, benDto.getProxyDate()));
    }

    private boolean isSameBeneficiary(RequestBeneficiary beneficiary, BeneficiaryDto dto) {
        return beneficiary != null && (
                beneficiary.getId() != null && beneficiary.getId().equals(dto.getId()) ||
                        beneficiary.getUuid() != null && beneficiary.getUuid().equals(dto.getUuid())
        );
    }
    private void linkGuarantor(RequestRepresentative entity, RepresentativeGuarantorDto garDto, DossierRequest request) {
        if (garDto.getGuarantor() == null || garDto.getProxyDate() == null) {
            return;
        }

        request.getGuarantors().stream()
                .filter(g -> isSameGuarantor(g, garDto.getGuarantor()))
                .findFirst()
                .ifPresent(guarantor -> entity.linkGuarantor(guarantor, garDto.getProxyDate()));
    }

    private boolean isSameGuarantor(RequestGuarantor guarantor, GuarantorDto dto) {
        return guarantor != null &&
                (guarantor.getId() != null && guarantor.getId().equals(dto.getId()) ||
                                guarantor.getUuid() != null && guarantor.getUuid().equals(dto.getUuid()));
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
