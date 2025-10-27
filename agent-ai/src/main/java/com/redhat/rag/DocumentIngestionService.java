package com.redhat.rag;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import org.jboss.logging.Logger;

import io.quarkiverse.langchain4j.easyrag.EasyRagManualIngestion;

/**
 * Serviço para gerenciar a ingestão de documentos no vector store.
 * 
 * Usamos ingestion manual para ter controle sobre quando indexar documentos,
 * evitando re-indexar toda vez que a aplicação inicia.
 */
@ApplicationScoped
public class DocumentIngestionService {

    private static final Logger LOG = Logger.getLogger(DocumentIngestionService.class);

    @Inject
    EasyRagManualIngestion easyRagManualIngestion;

    private boolean isIngested = false;

    /**
     * Ingere todos os documentos do diretório configurado.
     * Só executa se ainda não foi feito nesta sessão.
     */
    public void ingestDocuments() {
        if (isIngested) {
            LOG.info("Documentos já foram ingeridos nesta sessão");
            return;
        }

        try {
            LOG.info("Iniciando ingestão de documentos...");
            easyRagManualIngestion.ingest();
            isIngested = true;
            LOG.info("Ingestão de documentos concluída com sucesso!");
        } catch (Exception e) {
            LOG.error("Erro ao ingerir documentos", e);
            throw new RuntimeException("Falha na ingestão de documentos", e);
        }
    }

    /**
     * Força uma nova ingestão, mesmo que já tenha sido executada.
     * Útil para re-indexar após adicionar novos documentos.
     */
    public void forceIngest() {
        LOG.info("Forçando re-ingestão de documentos...");
        isIngested = false;
        ingestDocuments();
    }

    /**
     * Verifica se os documentos já foram ingeridos nesta sessão.
     */
    public boolean isIngested() {
        return isIngested;
    }
    
    /**
     * Reseta o status de ingestão.
     * Útil quando os dados do RAG são limpos do Redis.
     */
    public void resetIngestionStatus() {
        LOG.info("Resetando status de ingestão");
        isIngested = false;
    }
}
