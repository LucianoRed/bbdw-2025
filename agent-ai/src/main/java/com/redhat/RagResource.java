package com.redhat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

import org.jboss.resteasy.reactive.multipart.FileUpload;
import org.jboss.resteasy.reactive.RestForm;

import com.redhat.rag.DocumentIngestionService;

/**
 * Endpoints de gerenciamento do RAG (Retrieval Augmented Generation)
 */
@Path("/admin/rag")
@Produces(MediaType.APPLICATION_JSON)
public class RagResource {
    
    @Inject
    DocumentIngestionService documentIngestionService;
    
    /**
     * Ingere documentos no vector store
     */
    @POST
    @Path("/ingest")
    public RagIngestionResult ingestDocuments() {
        try {
            long startTime = System.currentTimeMillis();
            documentIngestionService.ingestDocuments();
            long duration = System.currentTimeMillis() - startTime;
            return new RagIngestionResult(true, "Documentos ingeridos com sucesso", duration);
        } catch (Exception e) {
            return new RagIngestionResult(false, "Erro ao ingerir documentos: " + e.getMessage(), 0);
        }
    }
    
    /**
     * Força uma re-ingestão de documentos
     */
    @POST
    @Path("/reingest")
    public RagIngestionResult reingestDocuments() {
        try {
            long startTime = System.currentTimeMillis();
            documentIngestionService.forceIngest();
            long duration = System.currentTimeMillis() - startTime;
            return new RagIngestionResult(true, "Documentos re-ingeridos com sucesso", duration);
        } catch (Exception e) {
            return new RagIngestionResult(false, "Erro ao re-ingerir documentos: " + e.getMessage(), 0);
        }
    }
    
    /**
     * Verifica o status da ingestão
     */
    @GET
    @Path("/status")
    public RagStatusResult getRagStatus() {
        boolean ingested = documentIngestionService.isIngested();
        return new RagStatusResult(ingested, ingested ? "Documentos indexados" : "Documentos não indexados");
    }
    
    /**
     * Upload de documento para o diretório RAG
     */
    @POST
    @Path("/upload")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    public RagUploadResult uploadDocument(@RestForm("file") FileUpload file) {
        if (file == null) {
            return new RagUploadResult(false, "Nenhum arquivo foi enviado", null);
        }
        
        try {
            // Diretório de destino
            java.nio.file.Path ragDir = Paths.get("src/main/resources/rag-documents");
            if (!Files.exists(ragDir)) {
                Files.createDirectories(ragDir);
            }
            
            // Nome do arquivo
            String fileName = file.fileName();
            java.nio.file.Path destPath = ragDir.resolve(fileName);
            
            // Copia o arquivo
            Files.copy(file.filePath(), destPath, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            
            return new RagUploadResult(true, "Arquivo enviado com sucesso", fileName);
        } catch (IOException e) {
            return new RagUploadResult(false, "Erro ao salvar arquivo: " + e.getMessage(), null);
        }
    }
    
    /**
     * Lista todos os documentos no diretório RAG
     */
    @GET
    @Path("/documents")
    public RagDocumentsResult listDocuments() {
        try {
            java.nio.file.Path ragDir = Paths.get("src/main/resources/rag-documents");
            if (!Files.exists(ragDir)) {
                return new RagDocumentsResult(0, new ArrayList<>());
            }
            
            List<DocumentInfo> docs = Files.list(ragDir)
                .filter(Files::isRegularFile)
                .map(path -> {
                    try {
                        long size = Files.size(path);
                        String name = path.getFileName().toString();
                        return new DocumentInfo(name, size, getFileType(name));
                    } catch (IOException e) {
                        return null;
                    }
                })
                .filter(doc -> doc != null)
                .collect(Collectors.toList());
            
            return new RagDocumentsResult(docs.size(), docs);
        } catch (IOException e) {
            return new RagDocumentsResult(0, new ArrayList<>());
        }
    }
    
    /**
     * Remove um documento do diretório RAG
     */
    @DELETE
    @Path("/documents/{filename}")
    public RagDeleteResult deleteDocument(@PathParam("filename") String filename) {
        try {
            java.nio.file.Path filePath = Paths.get("src/main/resources/rag-documents", filename);
            
            if (!Files.exists(filePath)) {
                return new RagDeleteResult(false, "Arquivo não encontrado");
            }
            
            Files.delete(filePath);
            return new RagDeleteResult(true, "Arquivo deletado com sucesso");
        } catch (IOException e) {
            return new RagDeleteResult(false, "Erro ao deletar arquivo: " + e.getMessage());
        }
    }
    
    private String getFileType(String filename) {
        if (filename.endsWith(".md")) return "Markdown";
        if (filename.endsWith(".txt")) return "Text";
        if (filename.endsWith(".pdf")) return "PDF";
        if (filename.endsWith(".html")) return "HTML";
        return "Unknown";
    }
    
    // Records para respostas
    public record RagIngestionResult(boolean success, String message, long durationMs) {}
    public record RagStatusResult(boolean ingested, String status) {}
    public record RagUploadResult(boolean success, String message, String filename) {}
    public record RagDocumentsResult(int count, List<DocumentInfo> documents) {}
    public record RagDeleteResult(boolean success, String message) {}
    public record DocumentInfo(String name, long size, String type) {}
}
