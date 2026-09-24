(async () => {
  const user = await ClientAdmin.loadMe();
  if (!user) return;
  const [usersResponse, clientResponse] = await Promise.all([
    ClientAdmin.api('/api/users'),
    ClientAdmin.api('/api/client-admin/settings'),
  ]);
  if (usersResponse && usersResponse.ok)
    document.getElementById('userCount').textContent = (
      await usersResponse.json()
    ).length;
  if (clientResponse && clientResponse.ok)
    document.getElementById('clientName').textContent = (
      await clientResponse.json()
    ).name;
})();
