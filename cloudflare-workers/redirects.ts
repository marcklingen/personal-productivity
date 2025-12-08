addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

// Define your domain mapping here
const domainMapping = {
  "docs.langfuse.com": { domain: "https://langfuse.com", pathPrefix: "docs/" },
  "blog.langfuse.com": { domain: "https://langfuse.com", pathPrefix: "blog/" },
  "www.langfuse.com": { domain: "https://langfuse.com", pathPrefix: "" },
  // Add more domain mappings as needed
};

async function handleRequest(request) {
  const url = new URL(request.url);
  const destinationDomain = domainMapping[url.hostname]["domain"];
  const pathPrefix = domainMapping[url.hostname]["pathPrefix"];

  if (destinationDomain) {
    // If there is a mapping for the current domain, create a new URL and redirect
    const redirectTo = new URL(destinationDomain);
    redirectTo.pathname = pathPrefix ? pathPrefix + url.pathname : url.pathname;
    redirectTo.search = url.search;

    // Temporary redirect
    return Response.redirect(redirectTo.toString(), 302);
  } else {
    // If there is no mapping for the current domain, return a 404 response
    return new Response("Not Found", { status: 404 });
  }
}
