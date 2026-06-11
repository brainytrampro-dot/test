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

        Map<String, RequestBeneficiary> beneficiaryPool = new HashMap<>();
        Map<String, RequestGuarantor> guarantorPool = new HashMap<>();
        syncGuarantors(newRequestDto, newRequest, guarantorPool);
        linkWarrantiesToRequest(newRequestDto, newRequest);
        linkPropertiesToBeneficiaries(newRequestDto, newRequest, beneficiaryPool);
        syncRepresentative(newRequestDto, newRequest, beneficiaryPool, guarantorPool);

        DossierRequest saved = dossierRequestRepository.save(newRequest);
        log.info("DossierRequest créé uuid={}", saved.getUuid());

        return dossierRequestMapper.convertToDTO(saved);
    }

    private void syncGuarantors(DossierRequestDto newRequestDto, DossierRequest newRequest, Map<String, RequestGuarantor> guarantorPool) {
        if(newRequest.getGuarantors() == null) newRequest.setGuarantors(new ArrayList<>());
        newRequest.getGuarantors().clear();

        if(newRequestDto.getGuarantors() != null && !newRequestDto.getGuarantors().isEmpty()) {
            newRequestDto.getGuarantors().forEach(g-> {
                RequestGuarantor guarantor = dossierRequestMapper.guarantorDtoToEntity(g);
                guarantor.setId(null);
                guarantor.setDossierRequest(newRequest);
                if(g.getUuid() != null) guarantorPool.put(g.getUuid(), guarantor);
                if(g.getId() != null) guarantorPool.put(g.getId().toString(), guarantor);
                newRequest.getGuarantors().add(guarantor);
            });
        }
    }

    private void syncRepresentative(DossierRequestDto newRequestDto, DossierRequest newRequest, Map<String, RequestBeneficiary> beneficiaryPool, Map<String, RequestGuarantor> guarantorPool) {
        if(newRequest.getRepresentatives() != null) newRequest.getRepresentatives().clear();
        else { newRequest.setRepresentatives(new ArrayList<>());}
        if(newRequestDto.getRepresentatives() != null && !newRequestDto.getRepresentatives().isEmpty()) {
            for (RepresentativeDto repDto : newRequestDto.getRepresentatives()) {
                RequestRepresentative  rep = representativeMapper.toEntity(repDto);
                rep.setDossierRequest(newRequest);
                rep.setId(null);

                linkCustomerRelationship(repDto, rep, newRequest.getDossier());
                linkBeneficiaryRelationships(repDto, rep, newRequest, beneficiaryPool);
                linkGuarantorRelationships(repDto, rep, newRequest, guarantorPool);

                newRequest.getRepresentatives().add(rep);
            }
        }
    }

    private void linkGuarantorRelationships(RepresentativeDto dto, RequestRepresentative entity, DossierRequest request, Map<String, RequestGuarantor> guarantorPool) {
        if (CollectionUtils.isEmpty(dto.getGuarantors()) || CollectionUtils.isEmpty(request.getGuarantors())) {
            return;
        }
        if(entity.getGuarantorAssociations() == null){
            entity.setGuarantorAssociations(new ArrayList<>());
        }
        dto.getGuarantors().forEach(guar -> {
            if(guar.getGuarantor() == null) return;
            String key = guar.getGuarantor().getUuid() != null ? guar.getGuarantor().getUuid() :
                    guar.getGuarantor().getId() != null ? guar.getGuarantor().getId().toString() : null;
            if(key == null) return;
             
            RequestGuarantor requestGuarantor = guarantorPool.get(key);
            if(requestGuarantor == null) return;

            RequestRepresentativeGuarantor association = new RequestRepresentativeGuarantor();
            association.setRepresentative(entity);
            association.setGuarantor(requestGuarantor);
            association.setProxyDate(guar.getProxyDate());

            entity.getGuarantorAssociations().add(association);
            
        });
    }


    private void linkCustomerRelationship(RepresentativeDto dto, RequestRepresentative entity, DossierData dossier) {
        if (dto.getCustomer() == null || dossier.getCustomerData() == null) {
            return;
        }

        Customer customer = dossier.getCustomerData().getCustomer();
        LocalDate proxyDate = dto.getCustomer().getProxyDate();
        if(entity.getCustomerAssociations() == null){
            entity.setCustomerAssociations(new ArrayList<>());
        }
        if (customer != null && proxyDate != null) {
            RequestRepresentativeCustomer association = new  RequestRepresentativeCustomer();
            association.setRepresentative(entity);
            association.setCustomer(customer);
            association.setProxyDate(proxyDate);

            entity.getCustomerAssociations().add(association);
        }
    }

    private void linkBeneficiaryRelationships(RepresentativeDto dto, RequestRepresentative entity, DossierRequest request,
                                              Map<String, RequestBeneficiary> beneficiaryPool) {
        if (CollectionUtils.isEmpty(dto.getBeneficiaries()) || CollectionUtils.isEmpty(request.getBeneficiaries())) {
            return;
        }

        if(entity.getBeneficiaryAssociations() == null){
            entity.setBeneficiaryAssociations(new ArrayList<>());
        }

        dto.getBeneficiaries().forEach(ben -> {
            if(ben.getBeneficiary() == null) return;
            String key = ben.getBeneficiary().getUuid() != null ? ben.getBeneficiary().getUuid()
                    : ben.getBeneficiary().getId() != null ? ben.getBeneficiary().getId().toString() : null;
            if(key != null) {
                RequestBeneficiary requestBeneficiary = beneficiaryPool.get(key);
                if(requestBeneficiary == null) return;
                RequestRepresentativeBeneficiary association = new RequestRepresentativeBeneficiary();
                association.setRepresentative(entity);
                association.setBeneficiary(requestBeneficiary);
                association.setProxyDate(ben.getProxyDate());

                entity.getBeneficiaryAssociations().add(association);
            }
        });
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
                .dossier(request.getDossier())
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

    private void linkPropertiesToBeneficiaries(DossierRequestDto dto, DossierRequest newRequest, Map<String, RequestBeneficiary> beneficiaryPool) {
        Map<String, RequestProperty> propertyRegistry = buildPropertyRegistry(dto, newRequest);

        if (dto.getBeneficiaries() != null) {
            List<RequestBeneficiary> beneficiaries = dto.getBeneficiaries().stream()
                    .map(bDto -> buildBeneficiary(bDto, newRequest, propertyRegistry, beneficiaryPool))
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
            Map<String, RequestProperty> registry,
            Map<String, RequestBeneficiary> beneficiaryPool) {

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

        if(bDto.getUuid() != null) beneficiaryPool.put(bDto.getUuid(), beneficiary);
        if(bDto.getId() != null) beneficiaryPool.put(bDto.getId().toString(), beneficiary);
        return beneficiary;
    }
}



package ma.sg.its.octroicreditcore.service;

import jakarta.persistence.EntityNotFoundException;
import ma.sg.its.octroicreditcore.dto.*;
import ma.sg.its.octroicreditcore.enumeration.RequestStatus;
import ma.sg.its.octroicreditcore.exception.TechnicalException;
import ma.sg.its.octroicreditcore.mapper.*;
import ma.sg.its.octroicreditcore.model.*;
import ma.sg.its.octroicreditcore.repository.DossierDataRepository;
import ma.sg.its.octroicreditcore.repository.DossierRequestRepository;
import ma.sg.its.octroicreditcore.repository.DossierReturnDecisionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.junit.jupiter.SpringExtension;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(SpringExtension.class)
@ActiveProfiles("test")
class DossierRequestServiceTest {

    @Mock private DossierRequestRepository dossierRequestRepository;
    @Mock private DossierRequestMapper dossierRequestMapper;
    @Mock private RequestWarrantyMapper requestWarrantyMapper;
    @Mock private DossierReturnDecisionRepository dossierReturnDecisionRepository;
    @Mock private DossierDataRepository dossierDataRepository;
    @Mock private UserMapper userMapper;
    @Mock private BeneficiaryMapper beneficiaryMapper;
    @Mock private PropertyMapper propertyMapper;
    @Mock private RequestRepresentativeMapper representativeMapper;

    @InjectMocks
    private DossierRequestService dossierRequestService;

    private DossierRequestDto dto;
    private DossierData dossierData;
    private final String uuid = "uuid-123";

    @BeforeEach
    void setUp() {
        dossierData = new DossierData();
        dossierData.setUuid(uuid);
        dossierData.setId(100L);

        dto = new DossierRequestDto();
        dto.setDossier(DossierDataDto.builder().uuid(uuid).build());
        dto.setRequestStatus(RequestStatus.ACCEPTED.toString());
    }

    @Test
    void createDossierRequest_FullCoverage() {
        dto.setRequestWarranties(List.of(new RequestWarrantyDto()));

        dto.setRepresentatives(
                List.of(RepresentativeDto.builder()
                    .guarantors(new ArrayList<>())
                    .beneficiaries(new ArrayList<>())
                    .customer(RepresentativeCustomerDto.builder().build())
                .build())
        );
        PropertyDto p1 = PropertyDto.builder().id(1L).build();
        PropertyDto p2 = PropertyDto.builder().uuid("p-uuid").build();
        dto.setPropertyData(PropertyDataDto.builder().properties(List.of(p1, p2)).build());
        dto.setBeneficiaries(List.of(BeneficiaryDto.builder().rangs(
                List.of(RangDto.builder().rang(10).warrantyAmount(BigDecimal.TEN).propertyId(p1.getId()).build())
        ).properties(List.of(p1)).build()));

        DossierRequest previous = new DossierRequest();
        DossierRequest newEntity = new DossierRequest();

        when(dossierDataRepository.findByUuid(uuid)).thenReturn(dossierData);
        when(dossierRequestRepository.findFirstByRequestStatusAndDossierUuidOrderByCreatedAtDesc(any(), any()))
                .thenReturn(Optional.of(previous));

        when(dossierRequestMapper.convertToEntity(any())).thenReturn(newEntity);
        when(requestWarrantyMapper.toEntity(any())).thenReturn(new RequestWarranty());
        when(representativeMapper.toEntity(any())).thenReturn(new RequestRepresentative());

        RequestProperty rp = new RequestProperty();
        rp.setRangs(new ArrayList<>(List.of(new RequestRang())));
        when(propertyMapper.convertToRequestEntity(any())).thenReturn(rp);

        when(beneficiaryMapper.convertToRequestEntity(any())).thenReturn(new RequestBeneficiary());
        when(dossierRequestRepository.save(any())).thenReturn(newEntity);
        when(dossierRequestMapper.convertToDTO(any())).thenReturn(new DossierRequestDto());

        DossierRequestDto result = dossierRequestService.createDossierRequest(dto);

        assertNotNull(result);
        assertEquals(RequestStatus.CLOSED.toString(), previous.getRequestStatus());
        verify(dossierRequestRepository, times(2)).save(any());
        verify(propertyMapper, atLeastOnce()).convertToRequestEntity(any());
    }

    @Test
    void create_ShouldThrowException_WhenDtoOrDossierIsNull() {
        assertThrows(TechnicalException.class, () -> dossierRequestService.createDossierRequest(null));

        DossierRequestDto nullDossierDto = new DossierRequestDto();
        nullDossierDto.setDossier(null);
        assertThrows(TechnicalException.class, () -> dossierRequestService.createDossierRequest(nullDossierDto));
    }

    @Test
    void create_ShouldThrowException_WhenDossierNotFound() {
        when(dossierDataRepository.findByUuid(uuid)).thenReturn(null);
        assertThrows(EntityNotFoundException.class, () -> dossierRequestService.createDossierRequest(dto));
    }

    @Test
    void update_ShouldCreateReturnDecision_WhenStatusIsFinal() {
        DossierRequest existing = new DossierRequest();
        existing.setDossier(dossierData);
        dto.setRequestStatus(RequestStatus.REJECTED.toString());

        when(dossierRequestRepository.findFirstByRequestStatusAndDossierUuidOrderByCreatedAtDesc(any(), any()))
                .thenReturn(Optional.of(existing));
        when(dossierRequestRepository.save(any())).thenReturn(existing);

        dossierRequestService.updateDossierRequest(dto);

        verify(dossierReturnDecisionRepository, times(1)).save(any(DossierReturnDecision.class));
    }

    @Test
    void update_ShouldNotCreateReturnDecision_WhenStatusInProgress() {
        DossierRequest existing = new DossierRequest();
        dto.setRequestStatus("OTHER_STATUS");

        when(dossierRequestRepository.findFirstByRequestStatusAndDossierUuidOrderByCreatedAtDesc(any(), any()))
                .thenReturn(Optional.of(existing));
        when(dossierRequestRepository.save(any())).thenReturn(existing);

        dossierRequestService.updateDossierRequest(dto);

        verify(dossierReturnDecisionRepository, never()).save(any());
    }

    @Test
    void update_ShouldThrowException_WhenDossierDataInDtoIsNull() {
        dto.setDossier(null);
        assertThrows(TechnicalException.class, () -> dossierRequestService.updateDossierRequest(dto));
    }
    @Test
    void getMethods_ShouldWork() {
        List<DossierRequest> entities = List.of(new DossierRequest());
        List<DossierRequestDto> dtos = List.of(new DossierRequestDto());

        when(dossierRequestRepository.findAllByDossierUuid(uuid)).thenReturn(entities);
        when(dossierRequestMapper.mapToListDto(entities)).thenReturn(dtos);

        List<DossierRequestDto> resultList = dossierRequestService.getDossierRequests(uuid);
        assertNotNull(resultList, "La liste de DTO ne doit pas être nulle");

        DossierRequest entity = new DossierRequest();
        when(dossierRequestRepository.findByUuid(uuid)).thenReturn(entity);
        when(dossierRequestMapper.convertToDTO(entity)).thenReturn(new DossierRequestDto());

        DossierRequestDto resultDto = dossierRequestService.getDossierRequestByUuid(uuid);
        assertNotNull(resultDto, "Le DTO ne doit pas être nul");
    }
}
