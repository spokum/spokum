#!/usr/bin/env bash
set -uo pipefail

LOG=/root/spokum-nastroyka.log
green() { printf '\033[32m%s\033[0m\n' "$1"; }
step()  { printf '\n\033[1m%s\033[0m\n' "$1"; }

if [ "$(id -u)" != "0" ]; then
  echo "Запускать нужно от root"
  exit 1
fi

if [ "${SPOKUM_INSIDE:-}" != "1" ]; then
  printf '\n\033[1m=== СпокУм · подготовка сервера ===\033[0m\n'

  step "Шаг 1. Новый пароль root"
  echo "Старый пароль засвечен в переписке, нужен новый. Набор видно на экране."
  echo "От восьми символов, латиница и цифры."
  while true; do
    printf 'Новый пароль: '
    read -r fresh
    if [ ${#fresh} -lt 8 ]; then echo "Коротко, нужно минимум восемь"; continue; fi
    printf 'Ещё раз: '
    read -r again
    if [ "$fresh" != "$again" ]; then echo "Не совпало"; continue; fi
    if echo "root:$fresh" | chpasswd; then break; fi
    echo "Такой пароль система не приняла, попробуйте другой"
  done
  unset fresh again
  clear
  green "пароль сменён"

  echo
  echo "Дальше всё пойдёт в фоне, обрыв связи ему не помешает."
  echo "Идти будет минут десять."
  echo

  : > "$LOG"
  rm -f /root/spokum-gotovo
  SPOKUM_INSIDE=1 setsid nohup bash "$0" >> "$LOG" 2>&1 < /dev/null &
  sleep 2

  echo "Ниже видно, как идёт работа."
  echo "Если связь оборвётся, ничего не остановится: зайдите снова и посмотрите"
  echo "командой  tail -f /root/spokum-nastroyka.log"
  echo
  tail -f "$LOG" &
  TAILER=$!
  while [ ! -f /root/spokum-gotovo ]; do sleep 3; done
  sleep 2
  kill "$TAILER" 2>/dev/null
  exit 0
fi

export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a
export NEEDRESTART_SUSPEND=1

step "Шаг 2. Долечиваем прерванные установки, если они были"
dpkg --configure -a 2>/dev/null || true
apt-get -f install -y -qq 2>/dev/null || true
green "готово"

step "Шаг 3. Обновление системы"
apt-get update -qq
apt-get -o Dpkg::Options::="--force-confold" upgrade -y -qq
apt-get install -y -qq curl ca-certificates gnupg ufw fail2ban unattended-upgrades \
  postgresql-client-16 htop git jq rsync
green "система обновлена"

step "Шаг 4. Проверяем, что SSH жив"
systemctl enable ssh >/dev/null 2>&1 || true
systemctl restart ssh >/dev/null 2>&1 || systemctl restart sshd >/dev/null 2>&1 || true
systemctl is-active ssh >/dev/null 2>&1 && green "SSH работает" || echo "ВНИМАНИЕ: SSH не отвечает, нужна консоль в панели хостинга"

step "Шаг 5. Файл подкачки"
if [ ! -f /swapfile ]; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  green "добавлено 4 ГБ подкачки"
else
  green "подкачка уже есть"
fi
sysctl -qw vm.swappiness=10
grep -q 'vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf

step "Шаг 6. Файрвол"
ufw allow 22/tcp  comment 'ssh'   >/dev/null 2>&1
ufw allow 80/tcp  comment 'http'  >/dev/null 2>&1
ufw allow 443/tcp comment 'https' >/dev/null 2>&1
ufw default deny incoming  >/dev/null 2>&1
ufw default allow outgoing >/dev/null 2>&1
yes | ufw enable >/dev/null 2>&1
green "снаружи видны только 22, 80 и 443"

step "Шаг 7. Защита от перебора пароля"
cat > /etc/fail2ban/jail.local <<'CONF'
[sshd]
enabled  = true
maxretry = 8
bantime  = 600
findtime = 600
ignoreip = 127.0.0.1/8
CONF
systemctl enable fail2ban >/dev/null 2>&1
systemctl restart fail2ban >/dev/null 2>&1
green "восемь промахов подряд и адрес отдыхает десять минут"

step "Шаг 8. Автообновления безопасности"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
CONF
green "включены"

step "Шаг 9. Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com -o /tmp/docker.sh
  sh /tmp/docker.sh >/dev/null 2>&1
  systemctl enable --now docker >/dev/null 2>&1
fi
command -v docker >/dev/null 2>&1 && green "docker $(docker --version | awk '{print $3}' | tr -d ,)" || echo "docker не встал"

step "Шаг 10. Часовой пояс"
timedatectl set-timezone Europe/Moscow 2>/dev/null || true
hostnamectl set-hostname spokum 2>/dev/null || true
green "Москва"

IP=$(curl -s4 --max-time 10 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')

printf '\n\033[1m=== Первый шаг закончен ===\033[0m\n\n'
free -h | sed -n '1,3p'
echo
df -h / | tail -1
echo
echo "Адрес: $IP"
echo
green "Напишите в чат слово готово."
touch /root/spokum-gotovo
