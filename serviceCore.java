public List<RefUserDto>  getAllUsersFront(String uuid){
		DossierDataCoreDto dossierCore = dossierDataClient.retrieveByUuid(uuid);
		DossierDataDto dossier = dossierDataDtoMapper.convertToApiDTO(dossierCore);
		Assert.True(Objects.nonNull(dossier) && Objects.nonNull(dossier.getDossierOrganization()),
				"Dossier must be not null");

		List<String> professions = getAuthorizedProfessions(dossier.getCodeStage(), dossier.getCodeStatus());
		if (Objects.isNull(professions)) {
			throw new FunctionalException(Errors.REASSIGN_NOT_AUTH_IN_STAGE, Errors.REASSIGN_NOT_AUTH_IN_STAGE_DEC);
		}
		UserDto user = UserHelper.getCurrentUser();
		boolean isGABFront = Optional.ofNullable(user.getRoles())
				.map(roles -> roles.stream().anyMatch(role -> "GAB_FRONT".equals(role.getCode())))
				.orElse(false);

		DossierOrganization organization =dossier.getDossierOrganization();
		UserCriteriasDto criteriasDto= UserCriteriasDto.builder()
				.codeProfessions(professions)
				.inALLProfessions(Boolean.TRUE)
				.build();

		if(isGABFront){
			criteriasDto.setDrCode(organization.getDrCode());
		}else{
			criteriasDto.setDrppCode(organization.getDrppCode());
		}
		log.info("Fetching users with combined criteria: {}", criteriasDto);
		List<RefUserDto> users = fetchUsers(criteriasDto);
		log.info("Fetched {} users in total", users.size());

		return users;
	}



	public List<RefUserDto> getAllUsersByProfession(String businessKey) {
		log.info("Starting user retrieval for businessKey: {}", businessKey);
		List<String> authorizedProfessions = Arrays.asList("CTB","SCC","CTB_GBO_RN","CTB_GAR");
		TaskResult task = ppWorkflowService.getTask(businessKey);
		if(task != null){
			log.info("Task retrieved for businessKey {}: assignee = {}", businessKey, task.getAssignee());
			String codeProfession = getCodeProfessionForTaskAssignee(businessKey,task.getAssignee());
			if(authorizedProfessions.contains(codeProfession)){
				log.info("Authorized profession detected: {}. Fetching matching users...", codeProfession);
				UserCriteriasDto userCriteria= UserCriteriasDto.builder().codeProfessions(Collections.singletonList(codeProfession)).build();
				return fetchUsers(userCriteria);
			}
		}
		return Collections.emptyList();
	}


	public List<RefUserDto> getAllUsersByHierarchy(String businessKey) {
		try{
			DossierDataCoreDto dossierCore = dossierDataClient.retrieveByUuid(businessKey);
			DossierDataDto dossier = dossierDataDtoMapper.convertToApiDTO(dossierCore);
			Assert.True(Objects.nonNull(dossier) && Objects.nonNull(dossier.getDossierOrganization()),
					"Dossier must be not null");
			UserDto connectedUser = UserHelper.getCurrentUser();
			if(dossier==null) return Collections.emptyList();
			List<String> professions = getAuthorizedProfessions(dossier.getCodeStage(), dossier.getCodeStatus());
			if (Objects.isNull(professions)) {
				throw new FunctionalException(Errors.REASSIGN_NOT_AUTH_IN_STAGE, Errors.REASSIGN_NOT_AUTH_IN_STAGE_DEC);
			}

			UserDto assignee = getCurrentAssignee(businessKey);
			if (Objects.isNull(assignee)) {
				throw new FunctionalException(Errors.REASSIGN_NOT_ASSIGNED_TO_USER, Errors.REASSIGN_NOT_ASSIGNED_TO_USER_DESC);
			}
			if (Boolean.FALSE.equals(isUserInDirectory(assignee, connectedUser))) {
				throw new FunctionalException(Errors.CONECTED_USER_IS_NOT_PART_ASSIGNEE_HIEARARCHY, Errors.CONECTED_USER_IS_NOT_PART_ASSIGNEE_HIEARARCHY_DESC);
			}

			DossierOrganization organization =dossier.getDossierOrganization();
			UserCriteriasDto combinedCriteria= UserCriteriasDto.builder()
					.codeProfessions(professions)
					.drCode(organization.getDrCode())
					.ucCode(organization.getUcCode())
					.drppCode(organization.getDrppCode())
					.agencyCode(organization.getAgencyCode())
					.assignee(assignee.getMatricule())
					.build();

			log.info("Fetching users with combined criteria: {}", combinedCriteria);
			List<RefUserDto> users = fetchUsers(combinedCriteria);
			log.info("Fetched {} users in total", users.size());

			return users;
		} catch (IllegalArgumentException ex) {
			log.error("Validator selection error: {}", ex.getMessage());
			throw new TechnicalException("Validator selection: " + ex.getMessage());
		} catch (RuntimeException ex) {
			log.error("Unexpected error: {}", ex.getMessage());
			throw new TechnicalException("Unexpected error: " + ex.getMessage());
		}
	}
