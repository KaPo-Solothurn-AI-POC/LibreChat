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

  // We no longer need to process files, so this is simplified, but does it still need it???
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
    // try {
    //   if (!queryPromises.length || !processedEmbeddings.length) {
    //     return '';
    //   }
    try {
        const response = await query(); //query rag api
        const results = response.data;

        if (!results?.length || !Array.isArray(results)) {
          return 'The semantic search did not return any results.';
      }
      const sources = results.map((result) => ({
        fileName: result[0]?.metadata?.filename ?? 'unknown',
        page: result[0]?.metadata?.page ?? 'unknown',
      }));

      const context = results
      .map((result) => {
        const pageContent = result[0]?.page_content?.trim() ?? '';
        const fileName = result[0]?.metadata?.filename ?? 'unknown';
        return `
  <embedding>
  <filename>${fileName}</filename>
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

  //     const oneEmbedding = processedEmbeddings.length === 1;
  //     const header = `The user has provided ${oneEmbedding ? 'one' : processedEmbeddings.length} embedding${
  //       !oneEmbedding ? 's' : ''
  //     } for the conversation:`;

  //     // Constructing the context based on embeddings and filenames
  //     const embeddings = `${
  //       oneEmbedding
  //         ? ''
  //         : `\n<embeddings>`
  //     }${processedEmbeddings
  //       .map(
  //         (embedding) => `
  //           <embedding>
  //             <filename>${embedding.filename}</filename>
  //             <type>${embedding.type}</type> 
  //           </embedding>`
  //       )
  //       .join('')}${
  //       oneEmbedding
  //         ? ''
  //         : `\n</embeddings>`
  //     }`;

  //     // Resolve all queries (this now gets embeddings)
  //     const resolvedQueries = await Promise.all(queryPromises);

  //     const context =
  //       resolvedQueries.length === 0
  //         ? '\n\tThe semantic search did not return any results.'
  //         : resolvedQueries
  //           .map((queryResult, index) => {
  //             const embedding = processedEmbeddings[index];
  //             let contextItems = queryResult.data;

  //             const generateContext = (currentContext) =>
  //               `
  //           <embedding>
  //             <filename>${embedding.filename}</filename>
  //             <context>${currentContext}</context>
  //           </embedding>`;

  //             // if (useFullContext) {
  //             //   return generateContext(`\n${contextItems}`);
  //             // }

  //             contextItems = queryResult.data
  //               .map((item) => {
  //                 const pageContent = item[0].page_content;
  //                 return `
  //             <contextItem>
  //               <![CDATA[${pageContent?.trim()}]]>
  //             </contextItem>`;
  //               })
  //               .join('');

  //             return generateContext(contextItems);
  //           })
  //           .join('');

  //     // if (useFullContext) {
  //     //   const prompt = `${header}
  //     //     ${context}
  //     //     ${footer}`;

  //     //   return prompt;
  //     // }

  //     const prompt = `${header}
  //       ${embeddings}

  //       A semantic search was executed with the user's message as the query, retrieving the following context inside <context></context> XML tags.

  //       <context>${context}</context>

  //       ${footer}`;

  //     return prompt;
  //   } catch (error) {
  //     logger.error('Error creating context:', error);
  //     throw error;
  //   }
  // };

  return {
    processEmbedding,
    createDocContext,
  };
}

module.exports = createDocumentSearch;
