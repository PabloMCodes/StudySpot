type NotificationsModule = typeof import("expo-notifications");

let notificationHandlerConfigured = false;

async function getNotificationsModule(): Promise<NotificationsModule | null> {
  try {
    return await import("expo-notifications");
  } catch {
    return null;
  }
}

async function ensureNotificationHandlerConfigured(
  notifications: NotificationsModule,
): Promise<void> {
  if (notificationHandlerConfigured) {
    return;
  }

  notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  notificationHandlerConfigured = true;
}

export async function requestNotificationPermission(): Promise<boolean> {
  const notifications = await getNotificationsModule();
  if (!notifications) {
    return false;
  }

  await ensureNotificationHandlerConfigured(notifications);

  const existing = await notifications.getPermissionsAsync();
  if (
    existing.granted ||
    existing.ios?.status === notifications.IosAuthorizationStatus.PROVISIONAL
  ) {
    return true;
  }

  const updated = await notifications.requestPermissionsAsync();
  return Boolean(
    updated.granted ||
      updated.ios?.status === notifications.IosAuthorizationStatus.PROVISIONAL,
  );
}

export async function sendCheckinPromptNotification(locationName: string): Promise<void> {
  const notifications = await getNotificationsModule();
  if (!notifications) {
    return;
  }

  await ensureNotificationHandlerConfigured(notifications);

  await notifications.scheduleNotificationAsync({
    content: {
      title: "Nearby Study Spot",
      body: `Studying at ${locationName}? Make sure to check in!`,
      data: { type: "checkin_prompt", locationName },
    },
    trigger: null,
  });
}
