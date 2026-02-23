package com.redhat.systemprompt;

import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

/**
 * Endpoint REST para gerenciar o system prompt customizável em tempo real.
 *
 * GET  /admin/system-prompt         — retorna o prompt atual
 * PUT  /admin/system-prompt         — define um novo prompt
 * DELETE /admin/system-prompt       — remove o prompt customizado (volta ao padrão)
 */
@Path("/admin/system-prompt")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class SystemPromptResource {

    @Inject
    SystemPromptService systemPromptService;

    @GET
    public SystemPromptDTO getSystemPrompt() {
        return new SystemPromptDTO(
            systemPromptService.getCustomPrompt(),
            systemPromptService.hasCustomPrompt(),
            SystemPromptService.DEFAULT_PROMPT
        );
    }

    @PUT
    public Response setSystemPrompt(SystemPromptDTO dto) {
        if (dto == null || dto.prompt() == null) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(new ErrorDTO("Campo 'prompt' é obrigatório"))
                    .build();
        }
        systemPromptService.setCustomPrompt(dto.prompt());
        return Response.ok(getSystemPrompt()).build();
    }

    @DELETE
    public Response clearSystemPrompt() {
        systemPromptService.setCustomPrompt(null);
        return Response.ok(getSystemPrompt()).build();
    }

    public record SystemPromptDTO(String prompt, boolean active, String defaultPrompt) {}
    public record ErrorDTO(String error) {}
}
