exports.handler = async function () {
  return {
    statusCode: 200,
    headers: { "content-type": "text/plain" },
    body: "hello"
  };
};
