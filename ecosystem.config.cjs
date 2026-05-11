module.exports = {
  apps: [
    {
      name: "lecturemind",
      cwd: "/home/azureuser/lecturemind",
      script: "npm",
      args: "start"
    },
    {
      name: "lecturemind-worker",
      cwd: "/home/azureuser/lecturemind/worker",
      script: ".venv/bin/uvicorn",
      args: "app.main:app --host 127.0.0.1 --port 8000",
      env: {
        YOUTUBE_COOKIES_FILE: "/home/azureuser/lecturemind/worker/cookies.txt"
      }
    }
  ]
};
