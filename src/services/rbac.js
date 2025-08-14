const ROLES = {
    provider: ['read:profile', 'update:profile', 'create:order', 'read:order'],
    driver: ['read:profile', 'update:profile', 'accept:order', 'read:order'],
    admin: ['read:profile', 'update:profile', 'manage:users', 'manage:roles', 'read:order', 'update:order', 'delete:order']
};

function getUserPermissions(userType) {
    return ROLES[userType] || [];
}

function hasPermission(user, permission) {
    const perms = getUserPermissions(user.userType);
    return perms.includes(permission);
}

module.exports = {
    getUserPermissions,
    hasPermission,
    ROLES
};
