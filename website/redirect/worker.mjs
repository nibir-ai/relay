const legacyGuides = new Map([
  ['/guides/documentation-overview/', '/guides/overview/'],
  ['/guides/node-quickstart/', '/guides/node/'],
  ['/guides/fastapi-example/', '/guides/fastapi/'],
]);

export default {
  fetch(request) {
    const source = new URL(request.url);
    if (source.hostname !== 'nibir.online' || !/^\/relay(?:\/|$)/.test(source.pathname)) {
      return new Response('Not found', { status: 404 });
    }
    const target = new URL('https://relay-backend.pages.dev/');
    let path = source.pathname.slice('/relay'.length) || '/';
    if (!path.endsWith('/') && !path.split('/').pop().includes('.')) path += '/';
    target.pathname = legacyGuides.get(path) || path;
    target.search = source.search;
    return Response.redirect(target.toString(), 301);
  },
};
