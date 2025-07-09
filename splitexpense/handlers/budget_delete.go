package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/kofj/gorm-driver-d1/gormd1"
	"github.com/tanmaydatta/split-expense-with-wife/splitexpense/common"
	"gorm.io/gorm"
)

type BudgetDeleteRequest struct {
	Pin string `json:"pin"`
	Id  int32  `json:"id"`
}

func BudgetDeleteHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "invalid method", http.StatusBadRequest)
		return
	}

	valid, session := common.Authenticate(r)
	if !valid {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req BudgetDeleteRequest
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "failed to read request body", http.StatusInternalServerError)
		return
	}
	if err := json.Unmarshal(body, &req); err != nil {
		http.Error(w, fmt.Sprintf("Error parsing input, %v", err.Error()), http.StatusServiceUnavailable)
		return
	}

	if req.Pin != os.Getenv("AUTH_PIN") {
		http.Error(w, "invalid pin", http.StatusServiceUnavailable)
		return
	}

	dsn := os.Getenv("DSN_D1")
	if dsn == "" {
		log.Println("DSN_D1 environment variable not set")
		http.Error(w, "Internal server error: DSN not configured", http.StatusInternalServerError)
		return
	}
	db, err := gorm.Open(gormd1.Open(dsn), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		log.Printf("failed to connect to D1: %v", err)
		http.Error(w, "[budget_delete] failed to connect to db", http.StatusServiceUnavailable)
		return
	}

	tx := db.Model(&common.BudgetEntry{}).
		Where("groupid = ? and id = ?", session.Group.Groupid, req.Id).
		Update("deleted", common.NewSQLiteTime(time.Now()))

	if tx.Error != nil {
		http.Error(w, "[budget_delete] error writing in db", http.StatusInternalServerError)
		return
	}

	if tx.RowsAffected == 0 {
		http.Error(w, "error writing in db, 0 rows affected", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte("[budget_delete] Success"))
}
