import { useDialog } from "@opencode/ui/context/dialog"
import { addProjects } from "@/home/projects/add"
import { homeProjectDirectories } from "@/shell/layout/helpers"
import { useGlobal } from "@/runtime/server/runtime"
import { ServerConnection, useServers } from "@/runtime/server/registry"
import { useLayout } from "@/shell/state/layout"
import { useTabs } from "@/shell/tabs/tabs"
import { useDirectoryPicker } from "@/workspaces/selection/picker"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { useCommand, type CommandOption } from "./command"

export function DesktopCommands() {
  const command = useCommand()
  const language = useLanguage()
  const platform = usePlatform()

  command.register("desktop", () => {
    const commands: CommandOption[] = []

    if (platform.platform !== "desktop" || !platform.exportDebugLogs) return commands
    commands.push({
      id: "logs.export",
      title: language.t("command.logs.export"),
      category: language.t("command.category.settings"),
      onSelect: () => void platform.exportDebugLogs?.(),
    })

    return commands
  })

  return null
}

export function DesktopProjectCommands() {
  const command = useCommand()
  const language = useLanguage()
  const platform = usePlatform()
  const dialog = useDialog()
  const layout = useLayout()
  const global = useGlobal()
  const servers = useServers()
  const tabs = useTabs()
  const pickDirectory = useDirectoryPicker()

  const connection = () => {
    const route = layout.route()
    const server =
      route.type === "session"
        ? route.server
        : route.type === "draft"
          ? tabs.store.find((tab) => tab.type === "draft" && tab.draftID === route.draftID)?.server
          : layout.home.selection().server

    return servers.visible.find((conn) => ServerConnection.key(conn) === server) ?? servers.visible[0]
  }

  const available = () => {
    const conn = connection()

    if (!conn) return false
    const health = global.servers.health[ServerConnection.key(conn)]

    return (
      health?.healthy !== false ||
      (conn.type === "http" && health?.unauthorized === true) ||
      (conn.type === "extension" && conn.authenticationRequired)
    )
  }

  const openProject = () => {
    const conn = connection()

    if (!conn) return
    const start = (server: ServerConnection.Any) => {
      pickDirectory({
        server,
        title: language.t("command.project.open"),
        multiple: true,
        onSelect: (result) => {
          const directory = addProjects(global.ensureServerCtx(server), homeProjectDirectories(result))

          if (!directory) return
          layout.home.setSelection({ server: ServerConnection.key(server), directory })
          tabs.toggleHome({ home: false })
        },
      })
    }

    const authenticate = (server: ServerConnection.Any, onConnected: (next: ServerConnection.Any) => void) => {
      const key = ServerConnection.key(server)

      if (server.type !== "http" || !global.servers.health[key]?.unauthorized)
        return ServerConnection.authenticate(server, () => onConnected(server))
      void import("@/servers/connect/dialog").then(({ DialogServer }) => {
        void dialog.show(() => (
          <DialogServer
            mode="edit"
            server={server}
            onSave={(next) => onConnected(next)}
          />
        ))
      })

      return true
    }

    if (authenticate(conn, start)) return
    if (global.servers.health[ServerConnection.key(conn)]?.healthy === false) return
    start(conn)
  }

  command.register("desktop-project", () => {
    if (platform.platform !== "desktop") return []

    return [
      {
        id: "project.open",
        title: language.t("command.project.open"),
        category: language.t("command.category.project"),
        hidden: true,
        disabled: !available(),
        onSelect: openProject,
      },
    ]
  })

  return null
}
