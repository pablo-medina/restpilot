/** Show the real app and remove the boot splash after startup work is done. */
export function finishBoot() {
  document.body.classList.remove("is-booting");
  document.getElementById("app-boot")?.remove();
  document.getElementById("app")?.removeAttribute("hidden");
}
