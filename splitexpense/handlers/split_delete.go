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

type SplitDeleteRequest struct {
	Id int32 `json:"id"`
}

func SplitDeleteHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost && r.Method != http.MethodOptions {
		http.Error(w, "invalid method", http.StatusBadRequest)
		return
	}

	if r.Method == http.MethodOptions {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.WriteHeader(http.StatusOK)
		return
	}

	valid, session := common.Authenticate(r)
	if !valid {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req SplitDeleteRequest
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "failed to read request body", http.StatusInternalServerError)
		return
	}
	if err := json.Unmarshal(body, &req); err != nil {
		http.Error(w, fmt.Sprintf("Error parsing input, %v", err.Error()), http.StatusServiceUnavailable)
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
		http.Error(w, "[split_delete] failed to connect to db", http.StatusServiceUnavailable)
		return
	}

	txn := common.Transaction{}
	tx := db.Raw(`
		SELECT id, description, amount, strftime('%Y-%m-%dT%H:%M:%S', created_at) || '.000Z' as created_at, COALESCE(metadata, '{}') as metadata, currency, transaction_id, group_id, strftime('%Y-%m-%dT%H:%M:%S', deleted) || '.000Z' as deleted
		FROM transactions
		WHERE id = ?
	`, req.Id).Scan(&txn)
	if tx.Error != nil {
		http.Error(w, "error finding txn", http.StatusInternalServerError)
		return
	}
	if txn.GroupId != session.Group.Groupid {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	err = db.Transaction(func(tx *gorm.DB) error {
		err := tx.Model(&common.TransactionUser{}).
			Where("transaction_id = ?", txn.TransactionId).
			Update("deleted", common.NewSQLiteTime(time.Now())).Error
		if err != nil {
			return err
		}
		return tx.Model(&common.Transaction{}).Where("id = ?", req.Id).Update("deleted", common.NewSQLiteTime(time.Now())).Error
	})

	if err != nil {
		http.Error(w, "error deleting txn", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte("[split_delete] Success"))
}
