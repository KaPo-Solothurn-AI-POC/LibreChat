const axios = require('axios');
const { isEnabled } = require('~/server/utils');
const { logger } = require('~/config');

const footer = `Use the context as your learned knowledge to better answer the user.

In your response, remember to follow these guidelines:
- If you don't know the answer, simply say that you don't know.
- If you are unsure how to answer, ask for clarification.
- If possible, mention the name of the file from which you obtained the context.
`;

function createDocumentSearch(req, userMessageContent) {
  if (!process.env.RAG_API_URL) {
    return;
  }

  const queryPromises = [];
  const processedEmbeddings = [];
  const processedIds = new Set();
  const jwtToken = req.headers.authorization.split(' ')[1];
  //TODO: Add Full-Context Logic
  //const useFullContext = isEnabled(process.env.RAG_USE_FULL_CONTEXT);

  //TODO: Add Full-Context Logic
  const query = async () => {
    // RAG API call to retrieve query results (embeddings and filenames)
    return axios.post(
      `${process.env.RAG_API_URL}/context`,
      {
        query: userMessageContent, // Send user message as query for relevant embeddings
        k: 4, // number of results
      },
      {
        headers: {
          Authorization: `Bearer ${jwtToken}`,
          'Content-Type': 'application/json',
        },
      },
    );
  };

  // We no longer need to process files, so this is simplified
  const processEmbedding = async (embedding) => {
    if (embedding.embedded && !processedIds.has(embedding.file_id)) {
      try {
        const promise = query(embedding);  // Get embeddings for the query
        queryPromises.push(promise);
        processedEmbeddings.push(embedding);
        processedIds.add(embedding.file_id);
      } catch (error) {
        logger.error(`Error processing embedding ${embedding.filename}:`, error);
      }
    }
  };

  const createDocContext = async () => {
    try {
        const response = await query(); //query rag api
        const results = response.data;

        if (!results?.length || !Array.isArray(results)) {
          return 'The semantic search did not return any results.';
      }
      const sources = results.map((result) => ({
        fileName: result[0]?.metadata?.file_name ?? 'unknown',
        page: result[0]?.metadata?.page ?? 'unknown',
      }));

      const context = results
      .map((result) => {
        const pageContent = result[0]?.page_content?.trim() ?? '';
        const fileName = result[0]?.metadata?.file_name ?? 'unknown';
        return `
  <embedding>
  <file_name>${fileName}</file_name>
  <context>
    <![CDATA[${pageContent}]]>
  </context>
  </embedding>`;
      })
      .join('\n');

    const prompt = `The following context was retrieved by semantic search:

  <context>
  ${context}
  </context>

  ${footer}`;

    return {prompt, sources};
  } catch (error) {
    logger.error('Error creating context:', error);
    return '';
  }
};

  return {
    processEmbedding,
    createDocContext,
  };
}

module.exports = createDocumentSearch;
