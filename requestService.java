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

@Slf4j
@Service
@Transactional
@AllArgsConstructor
public class DossierRequestService {

    // ─────────────────────────────────────────────
    // Repositories
    // ─────────────────────────────────────────────
    private final DossierRequestRepository         dossierRequestRepository;
    private final DossierReturnDecisionRepository  dossierReturnDecisionRepository;
    private final DossierDataRepository            dossierDataRepository;

    // ─────────────────────────────────────────────
    // Mappers
    // ─────────────────────────────────────────────
    private final DossierRequestMapper dossierRequestMapper;
    private final RequestWarrantyMapper requestWarrantyMapper;
    private final BeneficiaryMapper    beneficiaryMapper;
    private final PropertyMapper       propertyMapper;
    private final UserMapper           userMapper;

    // ─────────────────────────────────────────────
    // Constants
    // ─────────────────────────────────────────────
    public static final String INVALID_OR_NULL_DOSSIER_REQUEST_DTO = "Invalid or null dossier request DTO";

    private static final List<String> FINAL_STATUSES = List.of(
            RequestStatus.REJECTED.toString(),
            RequestStatus.ACCEPTED.toString(),
            RequestStatus.CLOSED.toString()
    );

    // ═════════════════════════════════════════════
    //  READ
    // ═════════════════════════════════════════════

    public List<DossierRequestDto> getDossierRequests(String dossierUuid) {
        return dossierRequestMapper.mapToListDto(
                dossierRequestRepository.findAllByDossierUuid(dossierUuid)
        );
    }

    public DossierRequestDto getDossierRequestByUuid(String uuid) {
        return dossierRequestMapper.convertToDTO(
                dossierRequestRepository.findByUuid(uuid)
        );
    }

    // ═════════════════════════════════════════════
    //  CREATE
    // ═════════════════════════════════════════════

    @Transactional
    public DossierRequestDto createDossierRequest(DossierRequestDto newRequestDto) {
        validateRequestDto(newRequestDto);

        // 1. Charger le DossierData managé (dans le contexte Hibernate courant)
        DossierData dossierData = loadDossierData(newRequestDto.getDossier().getUuid());

        // 2. Fermer la demande en cours si elle existe
        closePreviousRequest(newRequestDto.getDossier().getUuid());

        // 3. Construire la nouvelle entité — sans IDs (nouvelle création)
        DossierRequest newRequest = dossierRequestMapper.convertToEntity(newRequestDto);
        newRequest.setId(null);           // ← garantit une insertion et non un merge detached
        newRequest.setDossier(dossierData); // ← entité managée, pas detached

        // 4. Lier les collections enfants (cascade ALL sur newRequest)
        linkWarrantiesToRequest(newRequestDto, newRequest);
        linkPropertiesToBeneficiaries(newRequestDto, newRequest);

        DossierRequest saved = dossierRequestRepository.save(newRequest);
        log.info("DossierRequest créé uuid={}", saved.getUuid());

        return dossierRequestMapper.convertToDTO(saved);
    }

    // ═════════════════════════════════════════════
    //  UPDATE
    // ═════════════════════════════════════════════

    @Transactional
    public DossierRequestDto updateDossierRequest(DossierRequestDto dossierRequestDto) {
        validateRequestDto(dossierRequestDto);

        DossierRequest existing = getLastDossierRequestInProgress(dossierRequestDto.getDossier().getUuid())
                .orElseThrow(() -> new TechnicalException("Dossier request not found"));

        applyDecision(existing, dossierRequestDto);

        if (isFinalStatus(dossierRequestDto.getRequestStatus())) {
            saveReturnDecision(existing);
        }

        DossierRequest updated = dossierRequestRepository.save(existing);
        return dossierRequestMapper.convertToDTO(updated);
    }

    // ═════════════════════════════════════════════
    //  PRIVATE — Validation
    // ═════════════════════════════════════════════

    private void validateRequestDto(DossierRequestDto dto) {
        if (dto == null || dto.getDossier() == null || dto.getDossier().getUuid() == null) {
            throw new TechnicalException(INVALID_OR_NULL_DOSSIER_REQUEST_DTO);
        }
    }

    // ═════════════════════════════════════════════
    //  PRIVATE — Chargement
    // ═════════════════════════════════════════════

    private DossierData loadDossierData(String uuid) {
        return Optional.ofNullable(dossierDataRepository.findByUuid(uuid))
                .orElseThrow(() -> new EntityNotFoundException("Dossier introuvable : " + uuid));
    }

    private Optional<DossierRequest> getLastDossierRequestInProgress(String dossierUuid) {
        return dossierRequestRepository
                .findFirstByRequestStatusAndDossierUuidOrderByCreatedAtDesc(
                        RequestStatus.IN_PROGRESS.toString(), dossierUuid
                );
    }

    // ═════════════════════════════════════════════
    //  PRIVATE — Statuts
    // ═════════════════════════════════════════════

    private void closePreviousRequest(String dossierUuid) {
        getLastDossierRequestInProgress(dossierUuid).ifPresent(last -> {
            last.setRequestStatus(RequestStatus.CLOSED.toString());
            dossierRequestRepository.save(last);
            log.debug("Demande précédente fermée uuid={}", last.getUuid());
        });
    }

    private boolean isFinalStatus(String status) {
        return FINAL_STATUSES.contains(status);
    }

    private void applyDecision(DossierRequest existing, DossierRequestDto dto) {
        existing.setRequestStatus(dto.getRequestStatus());
        existing.setDecisionDate(LocalDateTime.now());
        // userMapper retourne une entité non-managée → on l'utilise uniquement
        // pour les champs scalaires ; si User est une entité managée, charger
        // depuis le repo plutôt que de mapper depuis le DTO.
        existing.setDecidedBy(userMapper.convertToEntity(dto.getDecidedBy()));
    }

    private void saveReturnDecision(DossierRequest request) {
        DossierReturnDecision decision = DossierReturnDecision.builder()
                .dossier(request.getDossier())          // déjà managé
                .statusDossier(request.getStageDossier())
                .tries(1)
                .build();
        dossierReturnDecisionRepository.save(decision);
    }

    // ═════════════════════════════════════════════
    //  PRIVATE — Warranties
    // ═════════════════════════════════════════════

    /**
     * Crée les RequestWarranty en les rattachant au nouveau DossierRequest.
     * Cascade ALL sur la relation → le save du parent persiste les enfants.
     */
    private void linkWarrantiesToRequest(DossierRequestDto dto, DossierRequest newRequest) {
        if (dto.getRequestWarranties() == null) return;

        List<RequestWarranty> warranties = dto.getRequestWarranties().stream()
                .map(warrantyDto -> {
                    RequestWarranty warranty = requestWarrantyMapper.toEntity(warrantyDto);
                    warranty.setId(null);                  // ← nouvelle entité
                    warranty.setDossierRequest(newRequest); // ← back-reference
                    return warranty;
                })
                .toList();

        newRequest.setRequestWarranties(warranties);
    }

    // ═════════════════════════════════════════════
    //  PRIVATE — Properties & Beneficiaries
    // ═════════════════════════════════════════════

    /**
     * Règle Hibernate à respecter ici :
     *
     *  - RequestProperty  est partagée entre DossierRequest (OneToMany) et
     *    RequestBeneficiary (ManyToMany via join table).
     *  - On construit UNE SEULE instance de RequestProperty par clé métier
     *    (uuid ou id source) pour éviter les doublons et les detached entities.
     *  - Tous les IDs sont remis à null → INSERT garanti, pas de merge detached.
     *  - dossierRequest est setté sur chaque property pour la FK OneToMany.
     */
    private void linkPropertiesToBeneficiaries(DossierRequestDto dto, DossierRequest newRequest) {

        // Étape 1 : construire le catalogue des properties uniques
        Map<String, RequestProperty> propertyRegistry = buildPropertyRegistry(dto, newRequest);

        // Étape 2 : construire les bénéficiaires et leur associer les properties du catalogue
        if (dto.getBeneficiaries() != null) {
            List<RequestBeneficiary> beneficiaries = dto.getBeneficiaries().stream()
                    .map(bDto -> buildBeneficiary(bDto, newRequest, propertyRegistry))
                    .toList();
            newRequest.setBeneficiaries(beneficiaries);
        }

        // Étape 3 : attacher la liste plate des properties au DossierRequest (OneToMany)
        newRequest.setProperties(new ArrayList<>(propertyRegistry.values()));
    }

    /**
     * Construit le registre des properties à partir de propertyData du DTO.
     * Chaque property est instanciée une seule fois, identifiée par sa clé métier.
     */
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

    /**
     * Construit un RequestBeneficiary et résout ses properties depuis le registre.
     */
    private RequestBeneficiary buildBeneficiary(
            BeneficiaryDto bDto,
            DossierRequest newRequest,
            Map<String, RequestProperty> registry
    ) {
        RequestBeneficiary beneficiary = beneficiaryMapper.convertToRequestEntity(bDto);
        beneficiary.setId(null);                   // ← nouvelle entité, pas de detached
        beneficiary.setDossierRequest(newRequest);  // ← back-reference OneToMany

        if (bDto.getProperties() != null) {
            List<RequestProperty> linkedProps = bDto.getProperties().stream()
                    .map(pDto -> {
                        String key = resolvePropertyKey(pDto);
                        // Si la property n'existe pas encore dans le registre, on la crée
                        return registry.computeIfAbsent(key, k -> createFreshProperty(pDto, newRequest));
                    })
                    .toList();
            beneficiary.setProperties(linkedProps); // ← ManyToMany, même instance partagée
        }

        return beneficiary;
    }

    /**
     * Crée une RequestProperty fraîche (id=null) à partir du DTO.
     * Les Rangs enfants sont aussi réinitialisés (cascade ALL).
     */
    private RequestProperty createFreshProperty(PropertyDto pDto, DossierRequest newRequest) {
        // Reset ID côté DTO avant mapping pour éviter que le mapper copie un ID existant
        pDto.setId(null);

        RequestProperty prop = propertyMapper.convertToRequestEntity(pDto);
        prop.setId(null);  // sécurité double — garantit INSERT
        prop.setDossierRequest(newRequest); // FK vers DossierRequest (OneToMany)

        // Reset IDs des rangs (cascade ALL sur RequestProperty → RequestRang)
        if (prop.getRangs() != null) {
            prop.getRangs().forEach(rang -> rang.setId(null));
        }

        return prop;
    }

    /**
     * Détermine la clé métier d'une property DTO.
     * Priorité : id source (si non null) → uuid.
     */
    private String resolvePropertyKey(PropertyDto pDto) {
        return pDto.getId() != null ? pDto.getId().toString() : pDto.getUuid();
    }
}
