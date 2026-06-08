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
