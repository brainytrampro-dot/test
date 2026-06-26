package ma.sg.its.octroicreditcore.service.impl;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import ma.sg.its.octroicreditcore.dto.AttachmentDto;
import ma.sg.its.octroicreditcore.dto.InterventionDto;
import ma.sg.its.octroicreditcore.exception.TechnicalException;
import ma.sg.its.octroicreditcore.mapper.AttachmentCommentMapper;
import ma.sg.its.octroicreditcore.mapper.AttachmentControlMapper;
import ma.sg.its.octroicreditcore.mapper.AttachmentMapper;
import ma.sg.its.octroicreditcore.model.*;
import ma.sg.its.octroicreditcore.repository.*;
import ma.sg.its.octroicreditcore.service.AttachmentInterventionService;
import ma.sg.its.octroicreditcore.service.AttachmentService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.CollectionUtils;

import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.stream.Collectors;

@Slf4j
@Service
@Transactional
@RequiredArgsConstructor
public class AttachmentServiceImpl implements AttachmentService {

    private final AttachmentRepository repository;
    private final InterventionRepository interventionRepository;
    private final AttachmentControlRepository controlRepository;
    private final AttachmentCommentRepository commentRepository;
    private final AttachmentMapper attachmentMapper;
    private final AttachmentControlMapper attachmentControlMapper;
    private final AttachmentCommentMapper attachmentCommentMapper;
    private final DossierAttachmentTypeRepository dossierAttachmentTypeRepository;
    private final AttachmentInterventionService interventionService;
    private final WarrantyRepository warrantyRepository;
    private final RestrictionRepository restrictionRepository;

    @Override
    public AttachmentDto getAttachmentByUuid(String uuid) throws TechnicalException {
        Attachment attachment = repository.findByUuid(uuid)
                .orElseThrow(() -> new TechnicalException(String.format("No Attachment with uuid '%s'", uuid)));
        log.info("retrieving attachment '{}'", attachment.getId());
        AttachmentDto dto = attachmentMapper.convertToDTO(attachment);
        return dto;
    }

    @Override
    public AttachmentDto save(AttachmentDto attachmentDto) throws TechnicalException {
        Attachment attachment = attachmentMapper.convertToEntity(attachmentDto);
        Optional<DossierAttachmentType> optionalDAT = dossierAttachmentTypeRepository
                .findByCodeAndDossierUuid(attachmentDto.getDossierUuid(), attachmentDto.getAttachmentTypeCode());
        if (optionalDAT.isPresent()) {
            DossierAttachmentType dat = optionalDAT.get();
            attachment.setDossierAttachmentType(dat);
            Optional<Intervention> intervention = interventionService.getIntervention(attachment, attachmentDto);
            if (intervention.isPresent() && !Objects.isNull(intervention.get().getControls())) {
                intervention.get().getControls().forEach(control -> control.setIntervention(intervention.get()));
            }
            Attachment saved = repository.saveAndFlush(attachment);
            dat.setCompleted(true);
            dossierAttachmentTypeRepository.save(dat);
            return attachmentMapper.convertToDTO(saved);
        } else {
            throw new TechnicalException("No dossier attachment found with uuid: " + attachmentDto.getDossierUuid());
        }
    }

    @Override
    public void update(AttachmentDto attachmentDto) throws TechnicalException {
        Optional<Attachment> oldAttachment = repository.findByUuid(attachmentDto.getUuid());
        if (oldAttachment.isPresent()) {
            Attachment entity = oldAttachment.get();
            Optional<Intervention> intervention = interventionService.getIntervention(entity, attachmentDto);
            Optional<InterventionDto> interventionDto = interventionService.getInterventionDto(entity, attachmentDto);
            if (intervention.isPresent() && interventionDto.isPresent() && interventionDto.get().getControls() != null) {
                List<AttachmentControl> controls = interventionDto.get().getControls().stream()
                        .map(attachmentControlMapper::convertToEntity).collect(Collectors.toList());
                for (AttachmentControl control : controls) {
                    control.setIntervention(intervention.get());
                    control.getId().setInterventionId(intervention.get().getId());
                    log.info("AttachmentService:: Before save control: {} ,  ", control);
                    AttachmentControl savedAttachmentControl = controlRepository.save(control);
                    log.info("AttachmentService:: After save control: {} ,  ", savedAttachmentControl);
                }
                if(!CollectionUtils.isEmpty(interventionDto.get().getComments())) {
                    List<AttachmentComment> comments = interventionDto.get().getComments().stream()
                            .map(attachmentCommentMapper::convertToEntity).collect(Collectors.toList());
                    for (AttachmentComment comment : comments) {
                        comment.setIntervention(intervention.get());
                        log.info("AttachmentService:: Before save comment: {} ,  ", comment);
                        commentRepository.save(comment);
                        log.info("AttachmentService:: After save comment: {} ,  ", comment);
                    }
                }
            }
        } else {
            throw new TechnicalException("No  attachment found with uuid: " + attachmentDto.getUuid());
        }
    }


    @Override
    public void deleteByUuid(String uuid) throws TechnicalException {
        Attachment attachment = repository.findByUuid(uuid).orElseThrow(() -> new TechnicalException(String.format("No Attachment with uuid '%s'", uuid)));
        log.info("retrieving attachment to delete'{}'", attachment.getId());
        DossierAttachmentType dat = attachment.getDossierAttachmentType();
        dat.getAttachments().removeIf(a -> a.getId().equals(attachment.getId()));
        if (dat.getAttachments().isEmpty()) dat.setCompleted(false);
        dossierAttachmentTypeRepository.save(dat);
        attachment.setDossierAttachmentType(null);
        warrantyRepository.deleteByAttachmentId(attachment.getId());
        restrictionRepository.deleteByAttachmentId(attachment.getId());
        repository.save(attachment);
        interventionRepository.deleteAllByAttachmentId(attachment.getId());
        this.repository.delete(attachment);
    }

}






////// controller


package ma.sg.its.octroicreditcore.controller;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import ma.sg.its.octroicreditcore.dto.AttachmentDto;
import ma.sg.its.octroicreditcore.dto.DossierAttachmentTypeDto;
import ma.sg.its.octroicreditcore.exception.TechnicalException;
import ma.sg.its.octroicreditcore.service.AttachmentService;
import ma.sg.its.octroicreditcore.service.DossierAttachmentTypeService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@Slf4j
@RestController
@RequiredArgsConstructor
@RequestMapping("/attachments")
public class AttachmentController {
    private final DossierAttachmentTypeService dossierAttachmentTypeService;

    private final AttachmentService attachmentService;

    @PostMapping("dossier-attachment-type/{dossierAttachmentTypeUuid}")
    public ResponseEntity<HttpStatus> toggleDossierAttachmentType(
            @RequestBody DossierAttachmentTypeDto dossierAttachmentTypeDto,
            @PathVariable String dossierAttachmentTypeUuid) throws TechnicalException {
        dossierAttachmentTypeService.toggleDossierAttachmentType(dossierAttachmentTypeDto, dossierAttachmentTypeUuid);
        return ResponseEntity.noContent().build();
    }

    @PostMapping
    public ResponseEntity<AttachmentDto> createAttachment(@RequestBody AttachmentDto attachmentDto) {
        try {
            return new ResponseEntity<>(attachmentService.save(attachmentDto), HttpStatus.CREATED);
        } catch (TechnicalException e) {
            log.error("Error while saving attachment with uuid: {}", attachmentDto.getUuid(), e);
            return ResponseEntity.noContent().build();
        }
    }

    @PutMapping()
    public ResponseEntity<AttachmentDto> update(@RequestBody AttachmentDto attachmentDto) {
        log.info("AttachmentController:: Update downloaded file request : {}", attachmentDto);
        attachmentService.update(attachmentDto);
        AttachmentDto updateAttachmentDto = attachmentService.getAttachmentByUuid(attachmentDto.getUuid());
        log.info("AttachmentController:: Update downloaded file request : {}", updateAttachmentDto);

        return new ResponseEntity<>(updateAttachmentDto, HttpStatus.OK);
    }

    @GetMapping("{uuid}")
    public ResponseEntity<AttachmentDto> getAttachment(@PathVariable String uuid) {
        try {
            return new ResponseEntity<>(attachmentService.getAttachmentByUuid(uuid), HttpStatus.OK);
        } catch (TechnicalException e) {
            log.error("No attachment with uuid {}", uuid, e);
            return ResponseEntity.noContent().build();
        }
    }

    @DeleteMapping("{uuid}")
    public ResponseEntity<Void> delete(@PathVariable String uuid) {
        try {
            attachmentService.deleteByUuid(uuid);
        } catch (TechnicalException e) {
            log.error("No attachment with uuid: {}", uuid, e);
            return ResponseEntity.noContent().build();
        }
        return ResponseEntity.ok().build();
    }

}
